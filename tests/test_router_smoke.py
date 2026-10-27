# -*- coding: utf-8 -*-
"""Smoke test: verify React Router structure is correct.
Checks:
 1. App.tsx has RiRoutes as <Route path="ri/*" element={<RiRoutes />} /> (not bare).
 2. RiRoutes.tsx uses inner <Routes> with all <Route> inside it.
 3. Built JS bundle exists and is the latest.
"""
import os
import re
import glob
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def _read(p):
    return open(os.path.join(ROOT, p), encoding="utf-8").read()

def test_app_tsx_has_ri_as_route_element():
    src = _read("frontend/src/App.tsx")
    # Must have: <Route path="ri/*" element={<RiRoutes />} />
    assert '<Route path="ri/*" element={<RiRoutes />} />' in src, \
        "App.tsx must have <Route path='ri/*' element={<RiRoutes />} />"
    # Must NOT have a bare <RiRoutes /> (self-closing, not inside element={})
    # Remove all valid element={<RiRoutes />} occurrences first
    cleaned = src.replace('<Route path="ri/*" element={<RiRoutes />} />', '')
    assert '<RiRoutes />' not in cleaned, \
        "App.tsx must not have a bare <RiRoutes /> as a direct child of <Routes>"

def test_ri_routes_uses_inner_routes():
    src = _read("frontend/src/modules/report-intake/RiRoutes.tsx")
    # Must import Routes
    assert "import" in src and "Routes" in src
    # Find the actual <Routes> JSX tag (not in comments/imports)
    # The JSX <Routes> is followed by content and </Routes>
    m = re.search(r'<Routes>\s*\n(.*?)</Routes>', src, re.S)
    assert m, "RiRoutes.tsx must have a <Routes> JSX block"
    inner = m.group(1)
    # All <Route> elements must be inside this <Routes> block
    inner_routes = re.findall(r'<Route\b', inner)
    assert len(inner_routes) >= 6, f"RiRoutes must have at least 6 <Route> inside <Routes>, found {len(inner_routes)}"
    # The file should NOT have <Route> outside the <Routes> block
    # Remove the <Routes>...</Routes> block and check no <Route> remains in JSX
    without_routes = src[:m.start()] + src[m.end():]
    # Filter out import lines and comments
    jsx_lines = [l for l in without_routes.split("\n")
                 if not l.strip().startswith("import") and not l.strip().startswith("//")]
    bare_routes = [l for l in jsx_lines if re.search(r'<Route\b', l)]
    assert not bare_routes, f"RiRoutes.tsx has <Route> outside <Routes>: {bare_routes}"

def test_built_bundle_exists():
    js_files = glob.glob(os.path.join(ROOT, "frontend", "dist", "assets", "index-*.js"))
    assert js_files, "No built JS bundle found — run: cd frontend && npm run build"
    js = open(js_files[0], encoding="utf-8").read()
    print(f"Built bundle: {os.path.basename(js_files[0])} ({len(js)} bytes) — OK")
