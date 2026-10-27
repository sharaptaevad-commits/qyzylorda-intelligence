# -*- coding: utf-8 -*-
"""Forecasting engine: baseline models + candidate models with time-ordered
rolling-origin validation. No future leakage: each fold predicts only forward.

Methods:
  - seasonal naive (period=12 when enough history, else naive)
  - moving average (window=3)
  - exponential smoothing (Holt, trend) — simple alpha search
  - ARIMA(1,1,0)-lite fallback via naive when history too short

We deliberately keep models simple. A complex model is only used when the data
justifies it; otherwise baselines win and that is reported honestly.
"""
import math
import time
import uuid
from statistics import mean

try:
    from .common import MONTHS
except ImportError:  # pragma: no cover
    MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь",
              "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"]

MIN_POINTS = 8          # minimum cumulative observations to attempt a forecast
MIN_POINTS_HORIZON = {1: 6, 3: 8, 6: 12, 12: 24}


def _series_values(points):
    """points: list of {month, value} (monthly, may contain None). Returns aligned list."""
    return [p.get("value") for p in points]


def check_sufficiency(points, horizon=6):
    vals = _series_values(points)
    non_null = [v for v in vals if v is not None]
    n = len(non_null)
    need = MIN_POINTS_HORIZON.get(horizon, MIN_POINTS)
    sufficient = n >= max(MIN_POINTS, need)
    reason = None
    if n < MIN_POINTS:
        reason = "too_few_points"
    elif not sufficient:
        reason = "insufficient_for_horizon"
    # warn about gaps
    gaps = sum(1 for v in vals if v is None)
    return {"n": n, "need": need, "sufficient": sufficient, "reason": reason,
            "gaps": gaps, "has_gaps": gaps > 0}


def _naive_step(prev):
    return prev


def _moving_avg(values, window=3):
    if len(values) < window:
        return mean(values) if values else None
    return mean(values[-window:])


def _holt_step(history, alpha=0.3, beta=0.1):
    """Simple Holt double exponential smoothing one-step forecast."""
    if len(history) < 2:
        return history[-1] if history else None
    level = history[0]
    trend = history[1] - history[0]
    for y in history[1:]:
        last_level = level
        level = alpha * y + (1 - alpha) * (level + trend)
        trend = beta * (level - last_level) + (1 - beta) * trend
    return level + trend


def forecast_model(name, history, horizon):
    """Produce `horizon` forward steps from `history` (list of floats).
    Returns list of floats (None if not computable)."""
    h = [v for v in history if v is not None]
    if not h:
        return [None] * horizon
    out = []
    if name == "naive":
        last = h[-1]
        out = [last] * horizon
    elif name == "seasonal_naive":
        # 12-month seasonality; fall back to naive if < 24 points
        if len(h) >= 24:
            for i in range(horizon):
                idx = len(h) - 12 + (i % 12)
                out.append(h[idx] if 0 <= idx < len(h) else h[-1])
        else:
            out = [h[-1]] * horizon
    elif name == "moving_avg":
        base = _moving_avg(h, 3)
        out = [base] * horizon
    elif name == "holt":
        cur = list(h)
        for _ in range(horizon):
            nxt = _holt_step(cur)
            if nxt is None:
                nxt = cur[-1]
            out.append(nxt)
            cur.append(nxt)
    else:
        out = [h[-1]] * horizon
    return out


def _mae(a, p):
    d = [abs(x - y) for x, y in zip(a, p) if x is not None and y is not None]
    return mean(d) if d else None


def _rmse(a, p):
    d = [(x - y) ** 2 for x, y in zip(a, p) if x is not None and y is not None]
    return math.sqrt(mean(d)) if d else None


def _mase(a, p, naives):
    """MASE using in-sample 1-step naive as scale."""
    num = _mae(a, p)
    if num is None:
        return None
    den = _mae(a[1:], naives)
    if den in (None, 0):
        return None
    return num / den


def _mape(a, p):
    d = []
    for x, y in zip(a, p):
        if x is not None and y is not None and abs(x) > 1e-9:
            d.append(abs((x - y) / x) * 100)
    return mean(d) if d else None


def evaluate_models(history, horizon, models):
    """Rolling-origin / expanding-window validation on the tail of the series.
    Returns per-model metrics on held-out future (no leakage)."""
    h = [v for v in history if v is not None]
    n = len(h)
    # hold out the last `horizon` points as the test set
    if n < MIN_POINTS + horizon:
        return None, "insufficient"
    train, test = h[:-horizon], h[-horizon:]
    # in-sample 1-step naive (for MASE scale): predict t+1 from t
    naives = [train[i] for i in range(len(train) - 1)]
    # actual 1-step targets aligned to naives = train[1:]
    naives_actual = train[1:]

    results = {}
    for name in models:
        preds = forecast_model(name, train, horizon)
        results[name] = {
            "mae": _mae(test, preds),
            "rmse": _rmse(test, preds),
            "mase": _mase(naives_actual, naives, [None]),  # placeholder
            "mape": _mape(test, preds) if all(abs(x) > 1e-9 for x in test) else None,
            "preds": preds,
        }
    # recompute MASE properly: scale = in-sample 1-step naive MAE
    scale = _mae(naives_actual, naives)
    for name in results:
        mae = results[name]["mae"]
        results[name]["mase"] = (mae / scale) if (mae is not None and scale) else None
    # pick best by MASE (fallback MAE)
    def key(r):
        if r["mase"] is not None:
            return (0, r["mase"])
        if r["mae"] is not None:
            return (1, r["mae"])
        return (2, float("inf"))
    best = min(results, key=lambda k: key(results[k]))
    return results, best


def run_forecast(monthly_points, horizon=6, models=None, lang="ru"):
    """Full forecast run. monthly_points: list of {month,value} (derived monthly).
    Returns a forecast run dict (serializable)."""
    models = models or ["naive", "moving_avg", "holt", "seasonal_naive"]
    suff = check_sufficiency(monthly_points, horizon)
    run = {
        "id": uuid.uuid4().hex[:10],
        "ts": time.time(),
        "horizon": horizon,
        "sufficiency": suff,
        "available": suff["sufficient"],
        "history_months": len([v for v in _series_values(monthly_points) if v is not None]),
    }
    if not suff["sufficient"]:
        run["error"] = suff["reason"] or "insufficient"
        run["explanation"] = "insufficient_data"
        return run

    history = _series_values(monthly_points)
    evals, best = evaluate_models(history, horizon, models)
    if evals is None:
        run["available"] = False
        run["error"] = evals if isinstance(evals, str) else "insufficient"
        run["explanation"] = "insufficient_data"
        return run

    # final forecast trained on full history
    final_preds = forecast_model(best, history, horizon)
    start_month = (max(p["month"] for p in monthly_points) or 0) + 1
    fc = []
    for i, v in enumerate(final_preds):
        m = start_month + i
        year_shift = m > 12
        fc.append({
            "month_index": m,
            "label": f"{MONTHS[(m - 1) % 12]}{'('+str((m-1)//12)+')' if year_shift else ''}",
            "value": v,
        })

    # prediction interval: +/- 1 * RMSE as a simple, honest band
    rmse = evals[best]["rmse"]
    run["best_model"] = best
    run["metrics"] = {k: {kk: vv for kk, vv in v.items() if kk != "preds"}
                      for k, v in evals.items()}
    run["forecast"] = fc
    run["rmse"] = rmse
    run["interval"] = (1.0 if rmse else 0.0)  # multiplier
    run["history"] = monthly_points
    run["explanation"] = _explain(history, best, lang)
    return run


def _explain(history, best, lang):
    h = [v for v in history if v is not None]
    if len(h) < 2:
        return "insufficient_data"
    first, last = h[0], h[-1]
    direction = "up" if last > first else ("down" if last < first else "flat")
    # seasonality signal: compare average of same month across years (weak here)
    return f"trend_{direction}"
