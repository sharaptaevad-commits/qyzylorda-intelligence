# QYZYLORDA INDUSTRIAL INTELLIGENCE — multi-stage Dockerfile
# Stage 1: build frontend (Node 20)
# Stage 2: run backend (Python 3.11) + serve built frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ .
ARG VITE_API=/api
ENV VITE_API=$VITE_API
RUN npm run build

# ---- Runtime ----
FROM python:3.11-slim AS runtime
WORKDIR /app

# System deps needed by reportlab / Pillow (if present)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libfreetype6 libharfbuzz0b libfontconfig1 libglib2.0-0 \
    curl && \
    rm -rf /var/lib/apt/lists/*

# Python deps
COPY backend/requirements.txt ./backend/requirements.txt
RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir -r backend/requirements.txt

# App code
COPY app.py ./app.py
COPY backend/ ./backend/
# Pre-built frontend from stage 1
COPY --from=frontend-build /app/dist ./frontend/dist

# Non-root user
RUN useradd -m qyzy && mkdir -p backend/data/uploads && chown -R qyzy:qyzy /app
USER qyzy

ENV PORT=8771
EXPOSE 8771

# Healthcheck (Render uses this to detect readiness)
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fs http://127.0.0.1:${PORT:-8771}/api/health || exit 1

# Render injects $PORT at runtime. Default to 8771 for local `docker run`.
CMD ["sh", "-c", "python -m uvicorn app:app --host 0.0.0.0 --port ${PORT:-8771}"]
