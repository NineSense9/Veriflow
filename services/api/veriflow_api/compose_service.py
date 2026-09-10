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


def _analyze(ir: WorkflowIR) -> tuple[list[dict], list[dict], str]:
    errors = [item.model_dump() for item in check_workflow(ir)]
    findings = attack_compose(ir)
    status = "blocked" if errors else "checked"
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
    if ir_data:
        from veriflow_ir.workflow import WorkflowIR
        from veriflow_spec.compiler import compile_spec
        from veriflow_verify.result import verify_workflow

        ir = WorkflowIR.model_validate(ir_data)
        spec = compile_spec(row["source_nl"] or "", ir.domain)
        payload["spec"] = spec.model_dump(mode="json")
        payload["verification"] = verify_workflow(ir, spec).model_dump(mode="json")
    return payload


def _insert(user_id: int, nl: str, ir: WorkflowIR, compiler: str) -> dict:
    errors, findings, status = _analyze(ir)
    now = _now()
    with connect() as connection:
        cursor = connection.execute(
            """
            INSERT INTO compose_projects(
                user_id, source_nl, ir_json, check_errors_json, attack_json,
                gate_status, status, compiler, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
            """,
            (
                user_id,
                nl,
                _dump_ir(ir),
                json.dumps(errors, ensure_ascii=False),
                json.dumps(findings, ensure_ascii=False),
                status,
                compiler,
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


def create_from_nl(user_id: int, nl: str) -> dict:
    ir, backend = compile_nl(nl)
    return _insert(user_id, nl, ir, backend)


def create_from_example(user_id: int, name: str) -> dict:
    if name not in EXAMPLES:
        raise ValueError("unknown example")
    ir = load_example(name)
    labels = {
        "missing_gate": "把题直接入库，不要审题门。",
        "missing_bounds": "生成测资，但不要写数据范围守卫。",
        "valid_lis": "完整出题：生成器、范围守卫、暴力、审题门、入库。",
    }
    return _insert(user_id, labels[name], ir, "example")


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
    errors, findings, status = _analyze(ir)
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


def repair(user_id: int, project_id: int, nl: str | None) -> dict:
    row = get_project(user_id, project_id)
    if row is None:
        return None
    from veriflow_staticcheck.check import CheckError

    source = nl if nl is not None else row["source_nl"]
    errors = [
        CheckError.model_validate(item)
        for item in json.loads(row["check_errors_json"] or "[]")
    ]
    ir, backend = compile_nl(source, errors)
    now = _now()
    new_errors, findings, status = _analyze(ir)
    with connect() as connection:
        connection.execute(
            """
            UPDATE compose_projects
            SET source_nl = ?, ir_json = ?, check_errors_json = ?, attack_json = ?,
                status = ?, compiler = ?, gate_status = 'pending', updated_at = ?
            WHERE id = ?
            """,
            (
                source,
                _dump_ir(ir),
                json.dumps(new_errors, ensure_ascii=False),
                json.dumps(findings, ensure_ascii=False),
                status,
                backend,
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


def guarded_repair(user_id: int, project_id: int, max_iterations: int = 3) -> dict:
    row = get_project(user_id, project_id)
    if row is None or not row["ir_json"]:
        return None
    from veriflow_repair.loop import verify_repair_loop
    from veriflow_spec.compiler import compile_spec

    ir = WorkflowIR.model_validate_json(row["ir_json"])
    spec = compile_spec(row["source_nl"] or "", ir.domain)
    report = verify_repair_loop(ir, spec, max_iterations=max_iterations)
    payload = save_ir(user_id, project_id, report.ir)
    if payload is None:
        return None
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
