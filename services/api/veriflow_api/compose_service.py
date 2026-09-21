from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

from veriflow_api.compiler import compile_nl, load_example
from veriflow_api.compose_attack import attack_compose
from veriflow_api.db import connect
from veriflow_api.problem_package import ProblemPackage, load_explicit_template, validate_reference
from veriflow_ir.workflow import WorkflowIR
from veriflow_staticcheck.check import check_workflow

EXAMPLES = ("missing_gate", "missing_bounds", "valid_lis")


def _version_hash(row) -> str:
    content = json.dumps([json.loads(row["ir_json"] or "null"), row["source_nl"], row["package_hash"]], sort_keys=True)
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _mutable(row):
    if row["published_problem_id"]:
        raise PermissionError("published project is immutable; create a new draft")


def _lock_current(connection, row):
    connection.execute("BEGIN IMMEDIATE")
    current = connection.execute("SELECT * FROM compose_projects WHERE id = ? AND user_id = ?", (row["id"], row["user_id"])).fetchone()
    if current is None or current["updated_at"] != row["updated_at"]:
        raise PermissionError("project changed; reload and retry")
    _mutable(current)
    return current


def _require_package(row) -> ProblemPackage:
    if not row["package_json"]:
        raise PermissionError("problem package required")
    try:
        package = ProblemPackage.model_validate_json(row["package_json"])
    except ValueError as exc:
        raise PermissionError("invalid problem package") from exc
    if package.content_hash() != row["package_hash"]:
        raise PermissionError("problem package hash mismatch")
    return package


def _package_metadata(row) -> dict:
    try:
        package = _require_package(row)
    except PermissionError as exc:
        return {"ready": False, "reasons": [str(exc)], "public_test_count": 0, "hidden_test_count": 0}
    validation = json.loads(row["package_validation_json"] or "{}")
    ready = validation.get("verdict") == "AC" and validation.get("tests_passed") == len(package.public_tests) + len(package.hidden_tests)
    return {"ready": ready, "reasons": [] if ready else ["reference validation required"],
            "title": package.title, "hash": package.content_hash(),
            "public_test_count": len(package.public_tests), "hidden_test_count": len(package.hidden_tests),
            "provenance": json.loads(row["package_provenance_json"] or "{}"), "validation": validation}


def get_problem_package(user_id: int, project_id: int):
    row = get_project(user_id, project_id)
    if row is None:
        return None
    return json.loads(row["package_json"]) if row["package_json"] else None


def save_problem_package(user_id: int, project_id: int, payload: dict) -> dict | None:
    row = get_project(user_id, project_id)
    if row is None:
        return None
    _mutable(row)
    if set(payload) == {"template_id"}:
        package = load_explicit_template(payload["template_id"])
        provenance = {"kind": "explicit_template", "template_id": payload["template_id"],
                      "label": f"附带示例题包 {payload['template_id']}（非工作流生成）"}
    else:
        package = ProblemPackage.model_validate(payload)
        provenance = {"kind": "uploaded", "label": "用户导入题包"}
    validation = validate_reference(package)
    with connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        current = connection.execute("SELECT * FROM compose_projects WHERE id = ? AND user_id = ?", (project_id, user_id)).fetchone()
        if current is None:
            return None
        _mutable(current)
        connection.execute(
            """UPDATE compose_projects SET package_json = ?, package_hash = ?, package_provenance_json = ?,
               package_validation_json = ?, gate_status = 'pending', approved_version_hash = NULL,
               status = CASE WHEN status = 'gated' THEN 'checked' ELSE status END, updated_at = ? WHERE id = ?""",
            (package.model_dump_json(), package.content_hash(), json.dumps(provenance, ensure_ascii=False),
             json.dumps(validation), _now(), project_id),
        )
        connection.commit()
    return project_payload(get_project(user_id, project_id))


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
        "problem_package": _package_metadata(row),
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
    payload["compiler_ai_trace"] = payload["ai_trace"]
    payload["repair"] = None
    payload["repair_ai_trace"] = None
    with connect() as connection:
        repair_rows = connection.execute(
            "SELECT * FROM compose_repair_runs WHERE project_id = ? ORDER BY id DESC LIMIT 10", (row["id"],)
        ).fetchall()
    payload["repair_history"] = [
        {"id": item["id"], "created_at": item["created_at"],
         "before_ir": json.loads(item["before_ir_json"]), "after_ir": json.loads(item["after_ir_json"]),
         "report": json.loads(item["report_json"])} for item in repair_rows
    ]
    for item in repair_rows:
        if item["id"] == row["current_repair_run_id"] and item["after_ir_json"] == row["ir_json"] and item["source_nl"] == row["source_nl"]:
            payload["repair"] = json.loads(item["report_json"])
            payload["repair_ai_trace"] = payload["repair"].get("ai_trace")
            break
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

    payload = _insert(
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
    if name == "valid_lis":
        return save_problem_package(user_id, payload["id"], {"template_id": "VF1012"})
    return payload


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
            SELECT id, source_nl, status, gate_status, published_problem_id, updated_at, compiler, ai_trace_json
            FROM compose_projects WHERE user_id = ? ORDER BY id DESC LIMIT 50
            """,
            (user_id,),
        ).fetchall()
    out = []
    for row in rows:
        item = dict(row)
        raw = item.pop("ai_trace_json", None)
        if raw:
            item["ai_trace"] = json.loads(raw)
        else:
            item["ai_trace"] = {
                "stage": "nl_ir",
                "requested": False,
                "used": False,
                "status": "UNKNOWN",
                "fallback_reason": "provenance unavailable",
            }
        out.append(item)
    return out


def save_ir(user_id: int, project_id: int, ir: WorkflowIR) -> dict:
    row = get_project(user_id, project_id)
    if row is None:
        return None
    _mutable(row)
    source_nl = row["source_nl"] or ""
    errors, findings, status = _analyze(ir, source_nl)
    now = _now()
    with connect() as connection:
        _lock_current(connection, row)
        connection.execute(
            """
            UPDATE compose_projects
            SET ir_json = ?, check_errors_json = ?, attack_json = ?,
                status = ?, gate_status = 'pending', approved_version_hash = NULL,
                current_repair_run_id = NULL, updated_at = ?
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
    _mutable(row)
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
        _lock_current(connection, row)
        connection.execute(
            """
            UPDATE compose_projects
            SET source_nl = ?, ir_json = ?, check_errors_json = ?, attack_json = ?,
                status = ?, compiler = ?, ai_trace_json = ?, gate_status = 'pending',
                approved_version_hash = NULL, current_repair_run_id = NULL, updated_at = ?
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
    _mutable(row)
    errors = json.loads(row["check_errors_json"] or "[]")
    if decision == "approved" and errors:
        raise PermissionError("errors block gate")
    version = None
    if decision == "approved":
        package = _require_package(row)
        validate_reference(package)
        if not row["ir_json"]:
            raise PermissionError("no ir")
        ir = WorkflowIR.model_validate_json(row["ir_json"])
        session = _pipeline(ir, row["source_nl"] or "")
        if session.gate.ready != "READY" or session.status == "FAIL":
            raise PermissionError("verification blocked")
        version = _version_hash(row)
    status = "gated" if decision == "approved" else "blocked"
    now = _now()
    with connect() as connection:
        _lock_current(connection, row)
        connection.execute(
            """
            UPDATE compose_projects
            SET gate_status = ?, status = ?, updated_at = ?, approved_version_hash = ?
            WHERE id = ?
            """,
            (decision, status, now, version, project_id),
        )
        connection.commit()
    return project_payload(get_project(user_id, project_id))


def guarded_repair(user_id: int, project_id: int, max_iterations: int = 3, allow_ai: bool = True) -> dict:
    row = get_project(user_id, project_id)
    if row is None or not row["ir_json"]:
        return None
    _mutable(row)
    from veriflow_repair.loop import verify_repair_loop
    from veriflow_spec.compiler import compile_spec

    ir = WorkflowIR.model_validate_json(row["ir_json"])
    spec = compile_spec(row["source_nl"] or "", ir.domain)
    report = verify_repair_loop(ir, spec, max_iterations=max_iterations, allow_ai=allow_ai)
    errors, findings, status = _analyze(report.ir, row["source_nl"])
    after_json, now = _dump_ir(report.ir), _now()
    with connect() as connection:
        _lock_current(connection, row)
        cursor = connection.execute(
            "INSERT INTO compose_repair_runs(project_id, before_ir_json, after_ir_json, source_nl, report_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (project_id, row["ir_json"], after_json, row["source_nl"], report.model_dump_json(), now),
        )
        connection.execute(
            """UPDATE compose_projects SET ir_json = ?, check_errors_json = ?, attack_json = ?, status = ?,
               gate_status = 'pending', approved_version_hash = NULL, current_repair_run_id = ?, updated_at = ? WHERE id = ?""",
            (after_json, json.dumps(errors, ensure_ascii=False), json.dumps(findings, ensure_ascii=False), status, cursor.lastrowid, now, project_id),
        )
        connection.commit()
    return project_payload(get_project(user_id, project_id))


def publish(user_id: int, project_id: int) -> dict:
    snapshot = get_project(user_id, project_id)
    if snapshot is None:
        return None
    if snapshot["published_problem_id"]:
        return project_payload(snapshot)
    package = _require_package(snapshot)
    validated_version = _version_hash(snapshot)
    if snapshot["gate_status"] != "approved" or snapshot["approved_version_hash"] != validated_version:
        raise PermissionError("approval does not match current package and IR")
    if not snapshot["ir_json"]:
        raise PermissionError("no ir")
    ir = WorkflowIR.model_validate_json(snapshot["ir_json"])
    session = _pipeline(ir, snapshot["source_nl"] or "")
    if session.gate.ready != "READY" or session.status == "FAIL":
        raise PermissionError("verification blocked")
    # Run submitted code without holding SQLite's global write lock. The transaction
    # below rechecks the exact validated version before writing any artifacts.
    validate_reference(package)
    with connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute(
            "SELECT * FROM compose_projects WHERE id = ? AND user_id = ?", (project_id, user_id)
        ).fetchone()
        if row is None:
            return None
        if row["published_problem_id"]:
            connection.commit()
        else:
            if json.loads(row["check_errors_json"] or "[]"):
                raise PermissionError("static errors")
            if row["gate_status"] != "approved":
                raise PermissionError("gate")
            package = _require_package(row)
            if row["approved_version_hash"] != _version_hash(row) or _version_hash(row) != validated_version:
                raise PermissionError("approval does not match current package and IR")
            attack = json.loads(row["attack_json"] or "[]")
            if any(item.get("tag") == "weak_bounds" for item in attack):
                raise PermissionError("weak_tests")
            if not row["ir_json"]:
                raise PermissionError("no ir")
            used = {item["id"] for item in connection.execute("SELECT id FROM problems").fetchall()}
            index = 9001
            while f"VF{index}" in used:
                index += 1
            problem_id = f"VF{index}"
            spec = {
                "ir_version": "1.0", "id": problem_id, "title": package.title,
                "tags": ["compose"], "difficulty": 800, "languages": ["cpp17", "python3"],
                "time_limit_ms": package.limits.time_limit_ms,
                "memory_limit_mb": package.limits.memory_limit_mb,
                "signature": {"input": package.input, "output": package.output},
                "has_brute": False, "hidden_policy": "bank",
                "public_tests": [{"stdin": case.stdin, "stdout": case.stdout} for case in package.public_tests],
            }
            connection.execute(
                "INSERT INTO problems(id, spec_json, statement, difficulty, tags, published) VALUES (?, ?, ?, 800, ?, 1)",
                (problem_id, json.dumps(spec, ensure_ascii=False), package.statement, json.dumps(["compose"])),
            )
            for visibility, cases in (("public", package.public_tests), ("hidden", package.hidden_tests)):
                connection.executemany(
                    "INSERT INTO tests(problem_id, visibility, name, stdin, stdout) VALUES (?, ?, ?, ?, ?)",
                    [(problem_id, visibility, case.name or f"{visibility}-{index}", case.stdin, case.stdout)
                     for index, case in enumerate(cases, 1)],
                )
            connection.execute(
                "UPDATE compose_projects SET status = 'published', published_problem_id = ?, updated_at = ? WHERE id = ?",
                (problem_id, _now(), project_id),
            )
            connection.commit()
    return project_payload(get_project(user_id, project_id))
