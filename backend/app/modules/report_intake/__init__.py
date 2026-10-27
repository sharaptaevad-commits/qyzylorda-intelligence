# -*- coding: utf-8 -*-
"""Report Intake module — mekeleler (entities) report acceptance & validation.

Independent module. It does NOT compute any official indicator, does NOT forecast,
and does NOT write to the main statistics database (site_db.json). All its data
lives in its own ri_* JSON tables. Read-only reference to the existing district
list is allowed (not modified).

Phase 1 scope: Excel/CSV upload, statuses, general checks, error list,
dashboard, roles, audit. PDF/DOCX and Astana-format export are OUT of scope.
"""
from . import models, store as ri_store, validation  # noqa: F401
