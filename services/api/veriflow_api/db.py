from __future__ import annotations

import os
import sqlite3
from pathlib import Path

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS problems (
  id TEXT PRIMARY KEY,
  spec_json TEXT NOT NULL,
  statement TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  tags TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 1,
  kill_rate REAL
);
CREATE TABLE IF NOT EXISTS tests (
  id INTEGER PRIMARY KEY,
  problem_id TEXT NOT NULL,
  visibility TEXT NOT NULL,
  name TEXT NOT NULL,
  stdin TEXT NOT NULL,
  stdout TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  problem_id TEXT NOT NULL,
  lang TEXT NOT NULL,
  source TEXT NOT NULL,
  verdict TEXT,
  time_ms INTEGER,
  memory_kb INTEGER,
  counterexample_json TEXT,
  trace_json TEXT,
  job_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload TEXT,
  error TEXT,
  submission_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stress_runs (
  id INTEGER PRIMARY KEY,
  problem_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  rounds INTEGER NOT NULL,
  round_hit INTEGER,
  counterexample_json TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tutor_logs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  submission_id INTEGER,
  question TEXT NOT NULL,
  backend TEXT,
  spoiler_rejects INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contrast_logs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  submission_id INTEGER,
  solver TEXT NOT NULL,
  guess TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS compose_projects (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  source_nl TEXT NOT NULL,
  ir_json TEXT,
  check_errors_json TEXT,
  attack_json TEXT,
  gate_status TEXT NOT NULL DEFAULT 'pending',
  status TEXT NOT NULL,
  published_problem_id TEXT,
  compiler TEXT,
  ai_trace_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS verification_runs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  created_at TEXT NOT NULL,
  workflow_name TEXT,
  workflow_hash TEXT,
  status TEXT,
  issue_count INTEGER,
  coverage REAL,
  runtime_status TEXT,
  gate_ready TEXT,
  latency_ms REAL,
  summary_json TEXT NOT NULL,
  payload_json TEXT
);
"""


def db_path() -> Path:
    path = Path(os.environ.get("VERIFLOW_DB", "artifacts/veriflow.db"))
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(db_path(), check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


def init_db() -> None:
    with connect() as connection:
        connection.executescript(SCHEMA)
        cols = [row[1] for row in connection.execute("PRAGMA table_info(verification_runs)").fetchall()]
        if cols and "payload_json" not in cols:
            connection.execute("ALTER TABLE verification_runs ADD COLUMN payload_json TEXT")
        compose_cols = [row[1] for row in connection.execute("PRAGMA table_info(compose_projects)").fetchall()]
        if compose_cols and "ai_trace_json" not in compose_cols:
            connection.execute("ALTER TABLE compose_projects ADD COLUMN ai_trace_json TEXT")
        contrast_cols = [row[1] for row in connection.execute("PRAGMA table_info(contrast_logs)").fetchall()]
        if contrast_cols and "payload_json" not in contrast_cols:
            connection.execute("ALTER TABLE contrast_logs ADD COLUMN payload_json TEXT")
        user_cols = [row[1] for row in connection.execute("PRAGMA table_info(users)").fetchall()]
        if user_cols and "disabled" not in user_cols:
            connection.execute("ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0")
        connection.commit()
