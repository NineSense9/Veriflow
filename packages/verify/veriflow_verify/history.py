from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from veriflow_verify.pipeline import VerificationSession

SECRET_KEYS = {"api_key", "password", "secret", "token", "apikey", "access_key", "private_key"}


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            if key.lower().replace("-", "_") in SECRET_KEYS:
                out[key] = "[redacted]"
            else:
                out[key] = _redact(item)
        return out
    if isinstance(value, list):
        return [_redact(item) for item in value]
    if isinstance(value, str) and (value.startswith("sk-") or "password" in value.lower()):
        return "[redacted]"
    return value


def findings_from_session(session: dict | None) -> dict[str, int] | None:
    if not isinstance(session, dict):
        return None
    static = session.get("static") if isinstance(session.get("static"), dict) else {}
    static_n = len(static.get("issues") or [])
    runtime_n = len(session.get("runtime_findings") or [])
    return {"issue_count": static_n + runtime_n, "issue_static": static_n, "issue_runtime": runtime_n}


def record_session(
    connection,
    user_id: int | None,
    session: VerificationSession,
    parent_run_id: int | None = None,
) -> int:
    summary = {
        "status": session.status,
        "issue_codes": [issue.code for issue in session.static.issues],
        "issue_ids": [issue.id for issue in session.static.issues],
        "runtime_codes": [item.get("code") for item in session.runtime_findings if isinstance(item, dict)],
        "gate": session.gate.ready,
        "runtime": session.runtime.status,
        "coverage": session.runtime.constraint_runtime_coverage,
        "hash": session.workflow_hash,
        "latency_ms": session.latency_ms,
        "alignment_cost": session.alignment.alignment_cost,
        "name": session.ir.get("name"),
        "cross": session.cross.pattern,
        "parent_run_id": parent_run_id,
        "issue_static": len(session.static.issues),
        "issue_runtime": len(session.runtime_findings),
    }
    payload = _redact(json.loads(session.model_dump_json()))
    cur = connection.execute(
        """
        INSERT INTO verification_runs(
            user_id, created_at, workflow_name, workflow_hash, status,
            issue_count, coverage, runtime_status, gate_ready, latency_ms, summary_json, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            session.created_at or datetime.now(timezone.utc).isoformat(),
            summary["name"],
            session.workflow_hash,
            session.status,
            len(session.static.issues) + len(session.runtime_findings),
            session.runtime.constraint_runtime_coverage,
            session.runtime.status,
            session.gate.ready,
            session.latency_ms,
            json.dumps(summary, ensure_ascii=False),
            json.dumps(payload, ensure_ascii=False),
        ),
    )
    connection.commit()
    return int(cur.lastrowid)


def list_sessions(connection, user_id: int | None = None, limit: int = 30) -> list[dict]:
    if user_id is None:
        rows = connection.execute(
            "SELECT id, created_at, workflow_name, workflow_hash, status, issue_count, coverage, runtime_status, gate_ready, latency_ms, summary_json, payload_json FROM verification_runs ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    else:
        rows = connection.execute(
            """SELECT id, created_at, workflow_name, workflow_hash, status, issue_count, coverage, runtime_status, gate_ready, latency_ms, summary_json, payload_json
               FROM verification_runs WHERE user_id = ? OR user_id IS NULL ORDER BY id DESC LIMIT ?""",
            (user_id, limit),
        ).fetchall()
    return [_row(item, include_session=False) for item in rows]


def get_session(connection, run_id: int) -> dict | None:
    row = connection.execute("SELECT * FROM verification_runs WHERE id = ?", (run_id,)).fetchone()
    return _row(row, include_session=True) if row else None


def compare_sessions(left: dict, right: dict) -> dict:
    def codes(item: dict) -> set[str]:
        if item.get("summary") and isinstance(item["summary"], dict):
            return set(item["summary"].get("issue_codes") or []) | set(item["summary"].get("runtime_codes") or [])
        raw = item.get("summary_json")
        if isinstance(raw, str):
            summary = json.loads(raw)
            return set(summary.get("issue_codes") or []) | set(summary.get("runtime_codes") or [])
        return set(item.get("issue_codes") or [])

    a, b = codes(left), codes(right)
    return {
        "resolved": sorted(a - b),
        "new": sorted(b - a),
        "unchanged": sorted(a & b),
        "left_status": left.get("status"),
        "right_status": right.get("status"),
        "left_gate": left.get("gate_ready"),
        "right_gate": right.get("gate_ready"),
        "runtime": {"left": left.get("runtime_status"), "right": right.get("runtime_status")},
        "latency_ms": {"left": left.get("latency_ms"), "right": right.get("latency_ms")},
        "hashes": {"left": left.get("workflow_hash"), "right": right.get("workflow_hash")},
        "coverage": {"left": left.get("coverage"), "right": right.get("coverage")},
    }


def _row(row, include_session: bool = True) -> dict:
    payload = dict(row)
    if payload.get("summary_json"):
        try:
            payload["summary"] = json.loads(payload["summary_json"])
        except json.JSONDecodeError:
            payload["summary"] = {}
    session = None
    if payload.get("payload_json"):
        try:
            session = json.loads(payload["payload_json"])
        except json.JSONDecodeError:
            session = None
    counts = findings_from_session(session)
    if counts:
        payload["issue_count"] = counts["issue_count"]
        payload["issue_static"] = counts["issue_static"]
        payload["issue_runtime"] = counts["issue_runtime"]
    else:
        summary = payload.get("summary") or {}
        payload["issue_static"] = summary.get("issue_static")
        payload["issue_runtime"] = summary.get("issue_runtime")
    parent = (payload.get("summary") or {}).get("parent_run_id")
    if parent:
        payload["parent_run_id"] = parent
    if include_session:
        payload["session"] = session
    payload.pop("payload_json", None)
    return payload
