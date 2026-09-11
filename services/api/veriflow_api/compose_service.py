from __future__ import annotations

import json
from datetime import datetime, timezone

from veriflow_api.compiler import compile_nl, load_example
from veriflow_api.compose_attack import attack_compose
from veriflow_api.db import connect
from veriflow_ir.workflow import WorkflowIR
from veriflow_staticcheck.check import check_workflow

EXAMPLES = ("missing_gate", "missing_bounds", "valid_lis")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _dump_ir(ir: WorkflowIR) -> str:
    return json.dumps(ir.model_dump(mode="json", by_alias=True), ensure_ascii=False)


def _trace_json(ai_trace) -> str | None:
    if ai_trace is None:
        return None
    if hasattr(ai_trace, "model_dump"):
        return json.dumps(ai_trace.model_dump(), ensure_ascii=False)
    return json.dumps(ai_trace, ensure_ascii=False)


def _pipeline(ir: WorkflowIR, nl: str = ""):
    from veriflow_spec.compiler import compile_spec
    from veriflow_verify.pipeline import run_session

    spec = compile_spec(nl or "", ir.domain)
    return run_session(ir, spec, nl=nl or "")


def _analyze(ir: WorkflowIR, nl: str = "") -> tuple[list[dict], list[dict], str]:
    errors = [item.model_dump() for item in check_workflow(ir)]
    findings = attack_compose(ir)
    session = _pipeline(ir, nl)
    blocked = session.gate.ready == "BLOCKED" or bool(errors)
    status = "blocked" if blocked else "checked"
    return errors, findings, status


def project_payload(row) -> dict:
    ir_data = json.loads(row["ir_json"]) if row["ir_json"] else None
    payload = {
        "id": row["id"],
        "source_nl": row["source_nl"],
        "ir": ir_data,
        "errors": json.loads(row["check_errors_json"] or "[]"),
        "attack": json.loads(row["attack_json"] or "[]"),
        "gate_status": row["gate_status"],
        "status": row["status"],
        "published_problem_id": row["published_problem_id"],
        "compiler": row["compiler"],
        "updated_at": row["updated_at"],
    }
    raw_trace = None
    try:
        raw_trace = row["ai_trace_json"]
    except (KeyError, IndexError):
        raw_trace = None
    if raw_trace:
        payload["ai_trace"] = json.loads(raw_trace)
    else:
        payload["ai_trace"] = {
            "stage": "nl_ir",
            "requested": False,
            "used": False,
            "status": "UNKNOWN",
            "fallback_reason": "provenance unavailable",
        }
    if ir_data:
        from veriflow_ir.workflow import WorkflowIR
        from veriflow_spec.compiler import compile_spec
        from veriflow_verify.result import verify_workflow

        ir = WorkflowIR.model_validate(ir_data)
        spec = compile_spec(row["source_nl"] or "", ir.domain)
        payload["spec"] = spec.model_dump(mode="json")
        verification = verify_workflow(ir, spec)
        payload["verification"] = verification.model_dump(mode="json")
        from veriflow_runtime.cross import cross_verify
        from veriflow_runtime.mock_exec import mock_execute
        from veriflow_runtime.monitor import monitor_trace
        from veriflow_verify.gate import evaluate_gate

        trace = mock_execute(ir)
        runtime = monitor_trace(trace, spec)
        payload["trace"] = json.loads(trace.model_dump_json())
        payload["runtime"] = json.loads(runtime.model_dump_json())
        payload["cross"] = json.loads(cross_verify(verification, runtime).model_dump_json())
        payload["gate"] = json.loads(
            evaluate_gate(ir, spec, static=verification, runtime=runtime, run_runtime=False).model_dump_json()
        )
    return payload


def _insert(user_id: int, nl: str, ir: WorkflowIR, compiler: str, ai_trace=None) -> dict:
    errors, findings, status = _analyze(ir, nl)
    now = _now()
    with connect() as connection:
        cursor = connection.execute(
            """
            INSERT INTO compose_projects(
                user_id, source_nl, ir_json, check_errors_json, attack_json,
                gate_status, status, compiler, ai_trace_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                nl,
                _dump_ir(ir),
                json.dumps(errors, ensure_ascii=False),
                json.dumps(findings, ensure_ascii=False),
                status,
                compiler,
                _trace_json(ai_trace),
                now,
                now,
            ),
        )
        project_id = cursor.lastrowid
        connection.commit()
        row = connection.execute(
            "SELECT * FROM compose_projects WHERE id = ?", (project_id,)
        ).fetchone()
    return project_payload(row)


def create_from_nl(user_id: int, nl: str, allow_ai: bool = True) -> dict:
    ir, backend, trace = compile_nl(nl, allow_ai=allow_ai)
    return _insert(user_id, nl, ir, backend, trace)


def create_from_example(user_id: int, name: str) -> dict:
    if name not in EXAMPLES:
        raise ValueError("unknown example")
    ir = load_example(name)
    labels = {
        "missing_gate": "把题直接入库，不要审题门。",
        "missing_bounds": "生成测资，但不要写数据范围守卫。",
        "valid_lis": "完整出题：生成器、范围守卫、审题门、入库。",
    }
    from veriflow_verify.ai_trace import AIInvocationTrace

    return _insert(
        user_id,
        labels[name],
        ir,
        "example",
        AIInvocationTrace(
            stage="nl_ir",
            requested=False,
            used=False,
            status="NOT_USED",
            prompt_version="example",
        ),
    )


def get_project(user_id: int, project_id: int):
    with connect() as connection:
        row = connection.execute(
            "SELECT * FROM compose_projects WHERE id = ? AND user_id = ?",
            (project_id, user_id),
        ).fetchone()
    return row


def list_projects(user_id: int) -> list[dict]:
    with connect() as connection:
        rows = connection.execute(
            """
            SELECT id, source_nl, status, gate_status, published_problem_id, updated_at
            FROM compose_projects WHERE user_id = ? ORDER BY id DESC LIMIT 50
            """,
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def save_ir(user_id: int, project_id: int, ir: WorkflowIR) -> dict:
    row = get_project(user_id, project_id)
    if row is None:
        return None
    source_nl = row["source_nl"] or ""
    errors, findings, status = _analyze(ir, source_nl)
    now = _now()
    with connect() as connection:
        connection.execute(
            """
            UPDATE compose_projects
            SET ir_json = ?, check_errors_json = ?, attack_json = ?,
                status = ?, gate_status = 'pending', updated_at = ?
            WHERE id = ?
            """,
            (
                _dump_ir(ir),
                json.dumps(errors, ensure_ascii=False),
                json.dumps(findings, ensure_ascii=False),
                status,
                now,
                project_id,
            ),
        )
        connection.commit()
    return project_payload(get_project(user_id, project_id))


def repair(user_id: int, project_id: int, nl: str | None, allow_ai: bool = True) -> dict:
    row = get_project(user_id, project_id)
    if row is None:
        return None
    from veriflow_staticcheck.check import CheckError

    source = nl if nl is not None else row["source_nl"]
    errors = [
        CheckError.model_validate(item)
        for item in json.loads(row["check_errors_json"] or "[]")
    ]
    ir, backend, trace = compile_nl(source, errors, allow_ai=allow_ai)
    now = _now()
    new_errors, findings, status = _analyze(ir, source)
    with connect() as connection:
        connection.execute(
            """
            UPDATE compose_projects
            SET source_nl = ?, ir_json = ?, check_errors_json = ?, attack_json = ?,
                status = ?, compiler = ?, ai_trace_json = ?, gate_status = 'pending', updated_at = ?
            WHERE id = ?
            """,
            (
                source,
                _dump_ir(ir),
                json.dumps(new_errors, ensure_ascii=False),
                json.dumps(findings, ensure_ascii=False),
                status,
                backend,
                _trace_json(trace),
                now,
                project_id,
            ),
        )
        connection.commit()
    return project_payload(get_project(user_id, project_id))


def set_gate(user_id: int, project_id: int, decision: str) -> dict:
    if decision not in {"approved", "rejected"}:
        raise ValueError("bad gate")
    row = get_project(user_id, project_id)
    if row is None:
        return None
    errors = json.loads(row["check_errors_json"] or "[]")
    if decision == "approved" and errors:
        raise PermissionError("errors block gate")
    if decision == "approved" and row["ir_json"]:
        ir = WorkflowIR.model_validate_json(row["ir_json"])
        if _pipeline(ir, row["source_nl"] or "").gate.ready == "BLOCKED":
            raise PermissionError("verification blocked")
    status = "gated" if decision == "approved" else "blocked"
    now = _now()
    with connect() as connection:
        connection.execute(
            """
            UPDATE compose_projects
            SET gate_status = ?, status = ?, updated_at = ?
            WHERE id = ?
            """,
            (decision, status, now, project_id),
        )
        connection.commit()
    return project_payload(get_project(user_id, project_id))


def guarded_repair(user_id: int, project_id: int, max_iterations: int = 3, allow_ai: bool = True) -> dict:
    row = get_project(user_id, project_id)
    if row is None or not row["ir_json"]:
        return None
    from veriflow_repair.loop import verify_repair_loop
    from veriflow_spec.compiler import compile_spec

    ir = WorkflowIR.model_validate_json(row["ir_json"])
    spec = compile_spec(row["source_nl"] or "", ir.domain)
    report = verify_repair_loop(ir, spec, max_iterations=max_iterations, allow_ai=allow_ai)
    payload = save_ir(user_id, project_id, report.ir)
    if payload is None:
        return None
    if report.ai_trace is not None:
        now = _now()
        with connect() as connection:
            connection.execute(
                "UPDATE compose_projects SET ai_trace_json = ?, updated_at = ? WHERE id = ?",
                (_trace_json(report.ai_trace), now, project_id),
            )
            connection.commit()
        payload = project_payload(get_project(user_id, project_id))
    payload["repair"] = json.loads(report.model_dump_json())
    return payload


def publish(user_id: int, project_id: int) -> dict:
    row = get_project(user_id, project_id)
    if row is None:
        return None
    errors = json.loads(row["check_errors_json"] or "[]")
    if errors:
        raise PermissionError("static errors")
    if row["gate_status"] != "approved":
        raise PermissionError("gate")
    attack = json.loads(row["attack_json"] or "[]")
    if any(item.get("tag") == "weak_bounds" for item in attack):
        raise PermissionError("weak_tests")
    if not row["ir_json"]:
        raise PermissionError("no ir")
    ir = WorkflowIR.model_validate_json(row["ir_json"])
    session = _pipeline(ir, row["source_nl"] or "")
    if session.gate.ready != "READY":
        raise PermissionError("verification blocked")
    if session.status == "FAIL":
        raise PermissionError("verification failed")
    now = _now()
    with connect() as connection:
        used = {
            item["id"]
            for item in connection.execute("SELECT id FROM problems").fetchall()
        }
        index = 9001
        while f"VF{index}" in used:
            index += 1
        problem_id = f"VF{index}"
        title = (row["source_nl"] or "未命名出题").strip().splitlines()[0][:40]
        spec = {
            "ir_version": "1.0",
            "id": problem_id,
            "title": title,
            "tags": ["compose"],
            "difficulty": 800,
            "languages": ["cpp17", "python3"],
            "time_limit_ms": 1000,
            "memory_limit_mb": 256,
            "signature": {"input": "", "output": ""},
            "has_brute": False,
            "hidden_policy": "bank",
            "public_tests": [],
        }
        connection.execute(
            """
            INSERT INTO problems(id, spec_json, statement, difficulty, tags, published)
            VALUES (?, ?, ?, 800, ?, 1)
            """,
            (
                problem_id,
                json.dumps(spec, ensure_ascii=False),
                row["source_nl"],
                json.dumps(["compose"], ensure_ascii=False),
            ),
        )
        connection.execute(
            """
            UPDATE compose_projects
            SET status = 'published', published_problem_id = ?, updated_at = ?
            WHERE id = ?
            """,
            (problem_id, now, project_id),
        )
        connection.commit()
    return project_payload(get_project(user_id, project_id))
