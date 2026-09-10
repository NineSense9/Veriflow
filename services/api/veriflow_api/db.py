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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
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
        connection.commit()
