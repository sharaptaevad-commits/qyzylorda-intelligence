# -*- coding: utf-8 -*-
"""Models & constants for the Report Intake module.

Status lifecycle:
  pending -> uploaded -> checking -> (needs_fix | accepted) -> sent

A report has versions (re-upload keeps the old one). Every status change is
written to the audit journal (who, when, what).
"""
import time
import uuid

# --- report statuses (workflow) ------------------------------------------
ST_PENDING = "pending"          # Күтілуде
ST_UPLOADED = "uploaded"        # Жүктелді
ST_CHECKING = "checking"        # Тексерілуде
ST_NEEDS_FIX = "needs_fix"      # Түзету қажет
ST_ACCEPTED = "accepted"        # Қабылданды
ST_SENT = "sent"                # Астанаға жіберілді

STATUSES = [ST_PENDING, ST_UPLOADED, ST_CHECKING, ST_NEEDS_FIX, ST_ACCEPTED, ST_SENT]

# Allowed transitions
TRANSITIONS = {
    ST_PENDING:   [ST_UPLOADED],
    ST_UPLOADED:  [ST_CHECKING],
    ST_CHECKING:  [ST_NEEDS_FIX, ST_ACCEPTED],
    ST_NEEDS_FIX: [ST_UPLOADED, ST_ACCEPTED],   # re-upload, or manual accept after review
    ST_ACCEPTED:  [ST_SENT],
    ST_SENT:      [],
}

def new_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:12]}"

def now():
    return int(time.time())

def valid_transition(cur, nxt):
    return nxt in TRANSITIONS.get(cur, [])
