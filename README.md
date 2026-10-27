# QYZYLORDA INDUSTRIAL INTELLIGENCE

AI-қолдаулы өндіріс статистикасы, болжамдау және құжат интеллектісі платформасы.
Қызылорда облысы, Қазақстан.

**Стек:** React 18 + TypeScript + Vite + Tailwind + Recharts (frontend), FastAPI + Pydantic (backend), JSON-файл сақтау (сыртқы DB қажет емес), ережеге негізделген AI (сыртқы API тәуелділігі жоқ), шын мәніндегі статистикалық болжамдау (rolling-origin validatio).

> **Деректердің тұтастығы:** платформа ресми көрсеткіштерді ойлап таппайды.
> Айлық қатарлар мен болжамдар «жеткіліксіз расталған тарихи деректер» деп
> адал есептеледі, құрастырылған мәндер ешқашан берілмейді.
> **Data Management** арқылы көбірек тарихи дерек импорттау арқылы айлық
> қатарлар мен болжамдау ашылады.

---

## Жоба құрылымы

```
app.py                        # кіру нүктесі: /api + frontend статикасы
backend/
  main.py                     # REST endpoint-тері (auth, stats, forecast, DI, AI, comparative, data, reports, audit)
  store.py                    # JSON сақтау: site_db, documents, users/roles, sessions, settings, forecasts, sources, audit
  requirements.txt            # Python тәуелділіктері
  analysis/
    stats.py                  # уақыт қатарлары, KPI, аудан кестелері, cumulative→monthly
    forecast.py               # болжамдау: naive, seasonal-naive, moving-avg, Holt; MAE/RMSE/MASE; no-leakage
    ai.py                     # ережеге негізделген AI (summary, findings, Q&A) — сыртқы API жоқ
    parsers.py                # XLSX / CSV / TXT / DOCX / PDF парсерлер
    extract.py                # көрсеткіштерді анықтау: metric, region, year, period, unit
    compare.py                # A/B/C/D салыстыру
    reports.py                # PDF (reportlab) + Excel (openpyxl)
    i18n.py                   # толық kk / ru / en мәтіндер
    common.py                 # нормализация (аудандар, кезеңдер, сандар, metric key)
  data/
    site_db.json              # негізгі дерекқор (1300 жазба, 2025+2026)
    site_db_seed.json         # бастапқы 724 жазба (09.2026)
    uploads/                  # жүктелген Excel файлдары
    settings.json             # жүйелік баптаулар
    users.json                # пайдаланушылар + рөлдер
    audit.json                # аудит журналы
    ...                       # (reports, forecast_runs, sessions, sources, ...)
frontend/
  package.json                # Node.js тәуелділіктері
  vite.config.ts, tsconfig.json, tailwind.config.js, postcss.config.js
  index.html
  src/
    main.tsx, App.tsx         # кіру нүктесі
    Shell.tsx                 # sidebar (12 бөлім) + header (кезең, тіл, export) + auth
    api.ts                    # типтелген API клиент (token handling)
    i18n.ts + locales.json    # i18next, 3 тіл (kk/ru/en)
    components/               # UI компоненттері (KPI cards, badges, tables, charts)
    pages/                    # 12 бет (Dashboard, Industrial, Manufacturing, District, Forecast, DI, Comparative, AI, Reports, Data, Sources, Settings)
tests/
  test_platform.py            # 96 тест
  test_ri_report_intake.py    # Report Intake модулі тесттері
  test_router_smoke.py        # smoke тест
  test_seasonality.py         # сезондылық тесттері
  test_ui_batch.py            # UI пакет тесттері
README.md                     # бұл файл
.env.example                  # орта үлгісі (кілттерсіз)
```

---

## Орнату (Windows PowerShell)

### 1. Алдын ала қажеттіліктер
- **Python 3.10+** — [python.org](https://www.python.org/downloads/) немесе `winget install Python.Python.3.12`
- **Node.js 18+** — [nodejs.org](https://nodejs.org/) немесе `winget install OpenJS.NodeJS.LTS`

Тексеру:
```powershell
python --version    # 3.10+
node --version      # 18+
npm --version
```

### 2. ZIP-ті ашу
```powershell
# Мәселен, Downloads папкасынан:
Expand-Archive -Path "$env:USERPROFILE\Downloads\QYZYLORDA_INTELLIGENCE.zip" -DestinationPath "$env:USERPROFILE\QYZYLORDA" -Force
cd "$env:USERPROFILE\QYZYLORDA"
```

### 3. Python тәуелділіктерін орнату
```powershell
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
python -m pip install pytest    # тесттер үшін
```

### 4. Frontend build (bir рет)
```powershell
cd frontend
npm install
npm run build
cd ..
```

> **Ескерту:** `frontend/dist/` папкасы ZIP-ке кіреді (дайын build).
> Егер кодты өзгертсеңіз, `npm run build` қайта орнатыңыз.

### 5. Іске қосу
```powershell
cd "$env:USERPROFILE\QYZYLORDA"
python -m uvicorn app:app --host 127.0.0.1 --port 8771
```

### 6. Ашу
```powershell
Start-Process "http://127.0.0.1:8771"
```

---

## Демо аккаунттар (RBAC)

| Login | Password | Role |
|-------|----------|------|
| admin | admin | Administrator (барлық рұқсаттар) |
| analyst | analyst | Analyst (талдау, болжам, импорт, есеп) |
| viewer | viewer | Viewer (тек оқу) |

---

## Тесттер

```powershell
python -m pytest tests/ -v    # 96 тест
```

Жабулымы: мәтін нормализациясы (аудан/кезең), пайыздық және абсолюттік өзгерістер,
көрсеткіш/өлшем сәйкестігі, дубликат анықтау, құжат салыстыру, импорт растау,
роль авторизациясы, дерекқор салыстыру, болжам жеткіліктілігі/validatio/no-leakage,
API endpoint-тері, көптілді (kk/ru/en), PDF & Excel есеп генерациясы, upload edge cases.

---

## Навигация (12 бөлім, барлығы іске асырылған)

1. **Dashboard** — KPI карточкалар, өндіріс және өңдеу трендтері, өнеркәсіп құрылымы (pie), аудан рейтингі, негізгі өзгерістер.
2. **Industrial Production** — cumulative және айлық қатарлар, өлшем режимін ауыстыру (% / тыс. теңге), деректер кестесі, PDF/Excel экспорт.
3. **Manufacturing** — жалпы өндірістен бөлек (ешқашан теңестірілмейді), өз тренді + кесте.
4. **District Analytics** — рейтинг кестесі + bar chart, сұрыптау/іздеу, аудан detail drawer (барлық индикаторлар).
5. **Forecasting** — нақты инжиниринг: жеткіліктілік тексеру, 4 модель, rolling-origin validatio (MAE/RMSE/MASE/MAPE), ең жақсы модель таңдау, болжам интервалы, history-vs-forecast chart, «жеткіліксіз» күй.
6. **Document Intelligence** — drag-and-drop upload, extraction, A/B/C/D салыстыру, AI tab, review-and-approve импорт, PDF/Excel экспорт.
7. **Comparative Analytics** — екі аймақ/кезең/индикаторды салыстыру, айырмашылық кестесі + chart.
8. **AI Analyst** — платформа DB үстіндегі grounded Q&A, source цитаталары; факт / есептелген / болжам / талдау айырылтылады.
9. **Reports** — 5 есеп түрі, тәуелсіз есеп тілі, PDF/Excel.
10. **Data Management** — upload, preview, validation ережелері, дубликат анықтау, reject/reason кестесі, approve, импорт тарихы.
11. **Data Sources** — source provenance (org, doc, date, status) + audit log.
12. **Settings** — пайдаланушылар мен рөлдер (RBAC), жүйелік баптаулар.

---

## API (REST, `/api` астында, OpenAPI: `/api/docs`)

| Топ | Endpoint-тер |
|-----|--------------|
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Stats | `GET /stats/dashboard`, `GET /stats/industrial`, `GET /stats/manufacturing`, `GET /stats/district`, `GET /stats/district/{region}`, `GET /stats/index_dynamics`, `GET /stats/alerts/detailed` |
| Forecast | `POST /forecast`, `GET /forecast`, `GET /forecast/{id}` |
| Documents | `POST /upload`, `POST /analyze/{id}`, `GET /documents`, `GET/DELETE /documents/{id}` |
| AI | `GET /ai/{id}`, `POST /ai/ask` |
| Comparative | `POST /comparative/run` |
| Data | `POST /data/preview`, `POST /data/import`, `GET /data/history` |
| Reports | `GET /export/{id}/pdf|xlsx`, `GET /reports/export/{kind}`, `GET /reports/history` |
| Meta | `GET /i18n/{lang}`, `GET /settings`, `PUT /settings`, `GET /users`, `PUT /users/{id}`, `GET /sources`, `GET /audit`, `GET /health` |

Рұқсаттар **сервер жағында** орындалады (роль → рұқсат матрицасы `store.ROLE_PERMISSIONS`-те), тек UI-де жасырылмайды.

---

## Деректердің тұтастығы (мастер-спецификациядан)

1. Ойлап табылған ресми мәндер жоқ — барлығы `source`-қа сәйкес.
2. Болжамдар нақты мәннен бөлек белгіленеді (қосақ қызғылт сызық, «Прогноз» badge).
3. Демо/даму деректері нақты статистика ретінде берілмейді.
4. Ресми бақылаулар болжамдардан бөлінген.
5. Импортталған әр бақылауға source provenance сақталады.
6. Бастапқы мәндер сақталады; нормализация санды өзгертпейді.
7. Тихий overwrite жоқ — импорт анық растау + дедупликация қажет.
8. Үйлесімсіз индикаторлар (өлшем/кезең) салыстырылмайды; себебі көрсетіледі.
9. Дерек жеткіліксіздік тексерусіз болжам жоқ.
10. Белгісіздік (±RMSE) және модель шектеулері көрсетіледі.
11. Жоқ дерек «—» ретінде көрсетіледі, нөл емес.
12. Cumulative (жыл бойы) мәндер айлық ретінде емес.
13. Құжат салыстырулары және AI қорытындылары source reference-мен.
14. Расталмаған алынған мәндер импорттан бұрын расталуы керек.

---

## Қауіпсіздік

- Рольге негізделген қолдау (RBAC) сервер жағында орындалады.
- Парольдер хэштелген (SHA-256 + salt prefix) — тек демо.
- Файл түрі + өлшемі тексеріледі (25 MB, рұқсат етілген extension-дер).
- Session token-дер (opaque, in-memory + JSON).
- Upload, analysis, import, login, settings өзгерістерінің аудит журналы.
- Upload құжат мазмұны сенімсіз дерек ретінде қаралады (руқсат бермейді, жүйелік мінезді өзгертпейді).
- Frontend bundle-де қатты кодталған құпия кілттер жоқ.

---

## Баптау

`.env.example` қараңыз. Барлық параметрлер қажет емес; default мәндер жергілікті режимде жұмыс істейді.
AI қабілеті ережеге негізделген (`ai_provider=rules`); сыртқы provider AI abstraction layer арқылы қосылуы мүмкін.

---

## Development / deployment ескертпелері

- **Модульдік монолит** (бір FastAPI app) — микросервис жоқ.
- **JSON-файл сақтау** — нөл тәуелділік; өндірістік режимге PostgreSQL + SQLAlchemy + Alembic ауыстырыңыз.
- Frontend статикалық ресурс ретінде сервер арқылы беріледі (CORS қажет емес).
- `Dockerfile` + `docker-compose.yml` ұсынылады (roadmap қараңыз).

## Тегін интернетке шығару (Render + GitHub)

Бұл платформа толық стек (FastAPI backend + React frontend), сондықтан
статикалық хостинг (Netlify/GitHub Pages) жеткіліксі — API сервері де
қажет. Тегін жол: **Render.com** (free web service) + **GitHub**.

### Қажеттіліктер
1. [github.com](https://github.com) аккаунты (тегін)
2. [render.com](https://render.com) аккаунты (тегін, GitHub-пен жалғасады)

### Қадамдар

#### 1. Кодты GitHub-қа жіберу
```powershell
# Жоба папкасында:
cd "$env:USERPROFILE\QYZYLORDA"
git init
git add .
git commit -m "QYZYLORDA Industrial Intelligence — initial release"

# GitHub-да жаңа repo ашып (мысалы: qyzylorda-intelligence), содан кейін:
git remote add origin https://github.com/<СИЗДІН_ЛОГИН>/qyzylorda-intelligence.git
git branch -M main
git push -u origin main
```

> `node_modules`, `__pycache__`, `dist`, `.env`, backup-тар `.gitignore`-те
> алынып тасталған (қоспаңыз, егер жоқ болса).

#### 2. Render-де деплой (Blueprint арқылы)
1. Render → **New** → **Blueprint**
2. Жоғарыдағы GitHub репозиторийні таңдаңыз
3. Render `render.yaml`-ді анықтайды — **1 web service** (Docker, free plan)
4. **Create Blueprint** → Render Docker image-ін құрады (frontend build + backend)
5. ~3-5 минуттан кейін сізге тегін URL береді: `https://qyzylorda-...onrender.com`

> **Eskertu:** Render free tier-де сервис 15 минут пайдаланылмағаннан кейін
> уйқыға кетеді (sleep). Алғашқы сұрау 30-60 сек "woken" кезеңін көрсетуі мүмкін —
> бұл қалыпты.

#### 3. Тексеру
Ашылған URL-де сайт + API істеп тұруы керек. Кіру: admin/admin.

### `.gitignore` (қажет болса қосыңыз)
```
node_modules/
__pycache__/
*.pyc
.pytest_cache/
dist/
build/
.env
_server.log
*.bak
_test_data_*/
```

---

## Roadmap (жоспарланған, әлі құрылмаған)
- PostgreSQL + Alembic миграциялары.
- Скандалған PDF үшін OCR (Tesseract / PaddleOCR).
- Ұзын құжаттар мен болжамдар үшін background job queue (Celery/RQ).
- Бар AI abstraction артындағы сыртқы LLM provider.
- Docker Compose deployment пакеті.
