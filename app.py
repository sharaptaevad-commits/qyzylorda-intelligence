# -*- coding: utf-8 -*-
"""FastAPI app entrypoint: API under /api, built frontend under /."""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import mimetypes
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from backend.main import app as api_app
from backend import store

store.init_site_db()

app = FastAPI(title="QYZYLORDA INDUSTRIAL INTELLIGENCE — Document Intelligence")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Cache headers: /assets/* (Vite-hashed) → long cache; index.html → no-cache
@app.middleware("http")
async def add_cache_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/assets/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif path == "/" or path.endswith(".html"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

app.mount("/api", api_app)

DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "dist")

def _index_html():
    p = os.path.join(DIST, "index.html")
    if os.path.exists(p):
        return FileResponse(p, headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        })
    return {"msg": "backend ok, frontend not built yet — run: cd frontend && npm install && npm run build"}

if os.path.isdir(DIST):
    # /assets/* — Vite-hashed files (immutable, long cache)
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets"), html=False), name="assets")

@app.get("/")
def index():
    return _index_html()

# SPA fallback: any non-API GET request that doesn't match a real file returns index.html.
# Since we use HashRouter, this mainly covers direct /path URLs (without #).
@app.get("/{full_path:path}")
async def spa_fallback(full_path: str, request: Request):
    # If the path looks like a real static file in DIST, try to serve it
    if os.path.isfile(os.path.join(DIST, full_path)):
        media_type = mimetypes.guess_type(full_path)[0] or "application/octet-stream"
        return FileResponse(os.path.join(DIST, full_path), media_type=media_type)
    # Otherwise return index.html (SPA)
    return _index_html()
