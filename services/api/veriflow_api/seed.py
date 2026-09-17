from __future__ import annotations

import json
import os
from pathlib import Path

from veriflow_api.auth import hash_password
from veriflow_api.db import connect
from veriflow_ir.spec import ProblemSpec

REPO_ROOT = Path(__file__).resolve().parents[3]
PROBLEMS_DIR = REPO_ROOT / "examples" / "problems"


def pack_file(problem_id: str, name: str) -> str | None:
    path = PROBLEMS_DIR / problem_id / name
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


def seed() -> None:
    with connect() as connection:
        _seed_users(connection)
        _seed_problems(connection)
        connection.commit()


def _seed_users(connection) -> None:
    users = [
        ("demo", os.environ.get("DEMO_PASSWORD", "demo"), "contestant"),
        ("setter", os.environ.get("SETTER_PASSWORD", "setter"), "setter"),
        ("admin", os.environ.get("ADMIN_PASSWORD", "admin"), "admin"),
    ]
    for name, password, role in users:
        existing = connection.execute(
            "SELECT id FROM users WHERE name = ?", (name,)
        ).fetchone()
        if existing:
            continue
        connection.execute(
            "INSERT INTO users(name, password_hash, role) VALUES (?, ?, ?)",
            (name, hash_password(password), role),
        )


def _seed_problems(connection) -> None:
    if not PROBLEMS_DIR.exists():
        return
    for problem_dir in sorted(PROBLEMS_DIR.iterdir()):
        spec_path = problem_dir / "spec.json"
        statement_path = problem_dir / "statement.md"
        if not spec_path.exists() or not statement_path.exists():
            continue
        spec = ProblemSpec.model_validate_json(spec_path.read_text(encoding="utf-8"))
        statement = statement_path.read_text(encoding="utf-8")
        connection.execute(
            """
            INSERT INTO problems(id, spec_json, statement, difficulty, tags, published)
            VALUES (?, ?, ?, ?, ?, 1)
            ON CONFLICT(id) DO UPDATE SET
              spec_json=excluded.spec_json,
              statement=excluded.statement,
              difficulty=excluded.difficulty,
              tags=excluded.tags
            """,
            (
                spec.id,
                spec.model_dump_json(),
                statement,
                spec.difficulty,
                json.dumps(spec.tags, ensure_ascii=False),
            ),
        )
        connection.execute("DELETE FROM tests WHERE problem_id = ?", (spec.id,))
        for visibility in ("public", "hidden"):
            tests_dir = problem_dir / "tests" / visibility
            if not tests_dir.exists():
                continue
            for stdin_path in sorted(tests_dir.glob("*.in")):
                stdout_path = stdin_path.with_suffix(".out")
                if not stdout_path.exists():
                    continue
                connection.execute(
                    """
                    INSERT INTO tests(problem_id, visibility, name, stdin, stdout)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        spec.id,
                        visibility,
                        stdin_path.stem,
                        stdin_path.read_text(encoding="utf-8"),
                        stdout_path.read_text(encoding="utf-8"),
                    ),
                )
