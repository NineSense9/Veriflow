from __future__ import annotations

import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field, ValidationError

from veriflow_api.auth import create_session, hash_password, revoke_session, user_for_token, verify_password
from veriflow_api import compose_service
from veriflow_api.db import connect, init_db
from veriflow_api.seed import pack_file, seed
from veriflow_api.mutate_service import ensure_kill_rate
from veriflow_api.report import export_markdown, sets_payload, summary
from veriflow_api.solver import solve as draft_solution
from veriflow_api.tutor import ask_tutor
from veriflow_api.contrast import ce_case, passes_tests, propose_aligned
from veriflow_ir.workflow import WorkflowIR
from veriflow_sandbox.factory import SandboxUnavailable, get_sandbox, sandbox_mode
from veriflow_sandbox.judge import Case, judge_submission
from veriflow_sandbox.stress import StressProgram, run_stress
from veriflow_staticcheck.check import check_workflow


def _load_dotenv() -> None:
    path = Path(__file__).resolve().parents[3] / ".env"
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if not key or key in os.environ:
            continue
        os.environ[key] = value.strip().strip('"').strip("'")


_load_dotenv()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    seed()
    yield


def create_app() -> FastAPI:
    application = FastAPI(title="Veriflow API", version="0.1.0", lifespan=lifespan)
    _register_routes(application)
    return application


class LoginBody(BaseModel):
    username: str
    password: str


class AdminCreateUserBody(BaseModel):
    username: str = Field(min_length=2, max_length=32)
    password: str = Field(min_length=4, max_length=72)
    role: Literal["contestant", "setter", "admin"] = "contestant"


class AdminDisableBody(BaseModel):
    disabled: bool


class AdminPublishBody(BaseModel):
    published: bool


class SubmitBody(BaseModel):
    lang: Literal["python3", "cpp17"]
    source: str = Field(min_length=1, max_length=200_000)


class SolveBody(BaseModel):
    lang: Literal["python3", "cpp17"]
    source: str = Field(default="", max_length=200_000)


class ComposeNL(BaseModel):
    nl: str = Field(min_length=1, max_length=20_000)
    allow_ai: bool = True


class ComposeExample(BaseModel):
    name: str


class ComposeIRBody(BaseModel):
    ir: dict


class ComposeGate(BaseModel):
    decision: Literal["approved", "rejected"]


class SpecCompileBody(BaseModel):
    nl: str = Field(min_length=1, max_length=20_000)
    domain: Literal["compose", "campus"] = "compose"


class VerifyBody(BaseModel):
    ir: dict
    nl: str = ""
    skip_after: str | None = None


class IncrementalBody(BaseModel):
    before: dict
    after: dict
    nl: str = ""


class SessionBody(BaseModel):
    ir: dict | None = None
    nl: str = ""
    skip_after: str | None = None
    demo: str | None = None
    parent_run_id: int | None = None


class CompareBody(BaseModel):
    left_id: int
    right_id: int


class AlgoTryBody(BaseModel):
    ir: dict
    source: str = ""
    target: str = ""
    nl: str = ""
    skip_after: str | None = None


class RepairLoopBody(BaseModel):
    ir: dict
    nl: str = ""
    max_iterations: int = Field(default=3, ge=1, le=5)
    allow_ai: bool = True


class AllowAiBody(BaseModel):
    allow_ai: bool = True
    max_iterations: int = Field(default=3, ge=1, le=5)


class MutateBody(BaseModel):
    ir: dict
    fault: str


class TutorBody(BaseModel):
    submission_id: int


class ContrastBody(BaseModel):
    submission_id: int


class StressBody(BaseModel):
    sol_lang: Literal["python3", "cpp17"]
    sol_source: str = Field(min_length=1, max_length=200_000)
    gen_lang: Literal["python3", "cpp17"] = "python3"
    gen_source: str | None = Field(default=None, max_length=200_000)
    brute_lang: Literal["python3", "cpp17"] = "python3"
    brute_source: str | None = Field(default=None, max_length=200_000)
    rounds: int = Field(default=50, ge=1, le=200)


def grade_submission(user_id: int, problem_id: str, lang: str, source: str) -> dict:
    with connect() as connection:
        problem = connection.execute(
            "SELECT id, spec_json FROM problems WHERE id = ? AND published = 1",
            (problem_id,),
        ).fetchone()
        tests = connection.execute(
            "SELECT name, stdin, stdout, visibility FROM tests WHERE problem_id = ?",
            (problem_id,),
        ).fetchall()
    if problem is None:
        raise HTTPException(
            status_code=404, detail={"code": "not_found", "message": "problem not found"}
        )
    spec = json.loads(problem["spec_json"])
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with connect() as connection:
        cursor = connection.execute(
            """
            INSERT INTO submissions(user_id, problem_id, lang, source, verdict, job_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, problem_id, lang, source, "queued", job_id, now),
        )
        submission_id = cursor.lastrowid
        connection.execute(
            """
            INSERT INTO jobs(id, type, status, payload, submission_id, created_at)
            VALUES (?, 'submit', 'queued', ?, ?, ?)
            """,
            (job_id, json.dumps({"problem_id": problem_id}), submission_id, now),
        )
        connection.commit()
    cases = [
        Case(
            stdin=row["stdin"],
            stdout=row["stdout"],
            visibility=row["visibility"],
            name=row["name"],
        )
        for row in tests
    ]
    try:
        sandbox = get_sandbox()
    except SandboxUnavailable as exc:
        raise HTTPException(status_code=503, detail={"code": "sandbox_down", "message": str(exc)}) from exc
    result = judge_submission(
        sandbox,
        lang,
        source,
        cases,
        spec.get("time_limit_ms", 1000),
        spec.get("memory_limit_mb", 256),
    )
    counterexample = json.dumps(result.counterexample, ensure_ascii=False) if result.counterexample else None
    trace = json.dumps(result.trace, ensure_ascii=False)
    with connect() as connection:
        connection.execute(
            """
            UPDATE submissions
            SET verdict = ?, time_ms = ?, memory_kb = ?, counterexample_json = ?, trace_json = ?
            WHERE id = ?
            """,
            (
                result.verdict,
                result.time_ms,
                result.memory_kb,
                counterexample,
                trace,
                submission_id,
            ),
        )
        connection.execute(
            "UPDATE jobs SET status = ?, error = ? WHERE id = ?",
            ("completed", result.detail, job_id),
        )
        connection.commit()
    kill = ensure_kill_rate(problem_id) if result.verdict == "AC" else None
    return {
        "job_id": job_id,
        "submission_id": submission_id,
        "verdict": result.verdict,
        "stage": result.stage,
        "time_ms": result.time_ms,
        "counterexample": result.counterexample,
        "sandbox": result.sandbox,
        "kill_rate": kill,
        "source": source,
    }


def _bearer_token(authorization: str | None, vf_session: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip()
    return vf_session


def current_user(
    authorization: Annotated[str | None, Header()] = None,
    vf_session: Annotated[str | None, Cookie()] = None,
):
    token = _bearer_token(authorization, vf_session)
    user = user_for_token(token)
    if user is None:
        raise HTTPException(status_code=401, detail={"code": "unauthenticated", "message": "login required"})
    return user


def require_admin(user=Depends(current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "需要管理员"})
    return user


def _user_stats(connection, user_id: int) -> tuple[int, int]:
    submissions = connection.execute(
        "SELECT COUNT(*) AS n FROM submissions WHERE user_id = ?",
        (user_id,),
    ).fetchone()["n"]
    solved = connection.execute(
        """
        SELECT COUNT(DISTINCT problem_id) AS n
        FROM submissions WHERE user_id = ? AND verdict = 'AC'
        """,
        (user_id,),
    ).fetchone()["n"]
    return int(submissions or 0), int(solved or 0)


def _register_routes(application: FastAPI) -> None:
    @application.get("/api/version")
    def api_version() -> dict[str, object]:
        from veriflow_verify.version import version_payload

        return version_payload()

    @application.get("/api/health")
    def health() -> dict[str, object]:
        mode = sandbox_mode()
        return {
            "ok": mode != "sandbox_down",
            "sandbox": mode,
            "ai": {
                "provider": "deepseek",
                "model": os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
                "configured": bool(os.environ.get("DEEPSEEK_API_KEY", "").strip()),
            },
        }

    @application.get("/api/sets")
    def list_sets():
        return sets_payload()

    @application.get("/api/report/summary")
    def report_summary(user=Depends(current_user)):
        del user
        return summary()

    @application.get("/api/report/export")
    def report_export(user=Depends(current_user), format: str = Query("md")):
        del user
        data = summary()
        if format == "json":
            return JSONResponse(data)
        return PlainTextResponse(export_markdown(), media_type="text/markdown")

    @application.post("/api/compose/check")
    def compose_check(ir: WorkflowIR) -> dict[str, object]:
        errors = check_workflow(ir)
        return {"ok": len(errors) == 0, "errors": [error.model_dump() for error in errors]}

    @application.post("/api/spec/compile")
    def spec_compile(body: SpecCompileBody, user=Depends(current_user)):
        del user
        from veriflow_spec.compiler import compile_spec

        return compile_spec(body.nl, body.domain).model_dump(mode="json")

    @application.post("/api/verify")
    def api_verify(body: VerifyBody, user=Depends(current_user)):
        del user
        from veriflow_spec.compiler import compile_spec
        from veriflow_verify.result import verify_workflow

        ir = WorkflowIR.model_validate(body.ir)
        spec = compile_spec(body.nl, ir.domain)
        return verify_workflow(ir, spec).model_dump(mode="json")

    @application.post("/api/repair")
    @application.post("/api/verify-repair")
    def api_verify_repair(body: RepairLoopBody, user=Depends(current_user)):
        del user
        from veriflow_repair.loop import verify_repair_loop
        from veriflow_spec.compiler import compile_spec

        ir = WorkflowIR.model_validate(body.ir)
        spec = compile_spec(body.nl, ir.domain)
        report = verify_repair_loop(ir, spec, max_iterations=body.max_iterations, allow_ai=body.allow_ai)
        return json.loads(report.model_dump_json())

    @application.post("/api/mutate")
    def api_mutate(body: MutateBody, user=Depends(current_user)):
        del user
        from veriflow_mutate.ir_faults import mutate_ir

        ir = WorkflowIR.model_validate(body.ir)
        return json.loads(mutate_ir(ir, body.fault).model_dump_json())

    @application.post("/api/runtime")
    def api_runtime(body: VerifyBody, user=Depends(current_user)):
        del user
        from veriflow_runtime.cross import cross_verify
        from veriflow_runtime.mock_exec import mock_execute
        from veriflow_runtime.monitor import monitor_trace
        from veriflow_spec.compiler import compile_spec
        from veriflow_verify.result import verify_workflow

        ir = WorkflowIR.model_validate(body.ir)
        spec = compile_spec(body.nl, ir.domain)
        static = verify_workflow(ir, spec)
        trace = mock_execute(ir, skip_after=body.skip_after)
        runtime = monitor_trace(trace, spec)
        return {
            "trace": json.loads(trace.model_dump_json()),
            "runtime": json.loads(runtime.model_dump_json()),
            "cross": json.loads(cross_verify(static, runtime).model_dump_json()),
        }

    @application.post("/api/incremental")
    def api_incremental(body: IncrementalBody, user=Depends(current_user)):
        del user
        from veriflow_spec.compiler import compile_spec
        from veriflow_verify.incremental import equivalence_report, incremental_verify
        from veriflow_verify.result import verify_workflow

        before = WorkflowIR.model_validate(body.before)
        after = WorkflowIR.model_validate(body.after)
        spec = compile_spec(body.nl, after.domain)
        previous = verify_workflow(before, spec)
        inc = incremental_verify(before, after, spec, previous=previous)
        full = verify_workflow(after, spec)
        eq = equivalence_report(full, inc.result)
        return {
            "incremental": json.loads(inc.model_dump_json()),
            "full": json.loads(full.model_dump_json()),
            "equivalence": json.loads(eq.model_dump_json()),
        }

    @application.post("/api/gate")
    def api_gate(body: VerifyBody, user=Depends(current_user)):
        del user
        from veriflow_spec.compiler import compile_spec
        from veriflow_verify.gate import evaluate_gate

        ir = WorkflowIR.model_validate(body.ir)
        spec = compile_spec(body.nl, ir.domain)
        return json.loads(evaluate_gate(ir, spec).model_dump_json())

    @application.get("/api/integrations/n8n")
    def api_n8n_status(user=Depends(current_user)):
        del user
        from veriflow_runtime.n8n_live import n8n_status

        return n8n_status()

    @application.get("/api/demos")
    def api_demos(user=Depends(current_user)):
        del user
        from veriflow_api.demos import list_demos

        return {"demos": list_demos()}

    @application.get("/api/demos/{demo_id}")
    def api_demo(demo_id: str, user=Depends(current_user)):
        del user
        from veriflow_api.demos import load_demo

        try:
            return load_demo(demo_id)
        except KeyError:
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": "demo not found"})

    def resolve_report_inputs(body: SessionBody, user: dict):
        from veriflow_api.demos import load_demo
        from veriflow_spec.compiler import compile_spec
        from veriflow_spec.models import WorkflowSpec
        from veriflow_verify.history import get_session
        from veriflow_verify.pipeline import RuntimeContext

        skip = body.skip_after
        nl = body.nl
        if body.demo:
            demo = load_demo(body.demo)
            ir = WorkflowIR.model_validate(demo["ir"])
            nl = nl or demo["nl"]
            skip = skip if skip is not None else demo.get("skip_after")
        elif body.ir:
            try:
                ir = WorkflowIR.model_validate(body.ir)
            except ValidationError:
                raise HTTPException(status_code=422, detail={"code": "invalid_workflow", "message": "工作流结构无效，请检查节点与连线。"})
        else:
            raise HTTPException(status_code=400, detail={"code": "bad_request", "message": "ir or demo required"})
        if body.parent_run_id is not None:
            with connect() as connection:
                parent = get_session(connection, body.parent_run_id)
            if not parent or parent.get("user_id") not in (None, user["id"]):
                raise HTTPException(status_code=404, detail={"code": "not_found", "message": "找不到可访问的原始验证记录"})
            recorded = parent.get("session") or {}
            context = recorded.get("runtime_context")
            if context is None:
                raise HTTPException(status_code=409, detail={"code": "missing_runtime_context", "message": "该历史记录缺少运行条件，请先重新运行案例，再执行修复。原记录仍可查看和导出。"})
            try:
                context = RuntimeContext.model_validate(context)
                spec = WorkflowSpec.model_validate(recorded.get("spec"))
            except ValidationError:
                raise HTTPException(status_code=409, detail={"code": "invalid_runtime_context", "message": "该历史记录的运行条件或规格不完整，请重新运行案例。"})
            original_stop = next((node for node in (recorded.get("ir") or {}).get("nodes", []) if node.get("id") == context.skip_after), None)
            updated_stop = next((node.model_dump(mode="json", by_alias=True) for node in ir.nodes if node.id == context.skip_after), None)
            conflict = (
                ("skip_after" in body.model_fields_set and body.skip_after != context.skip_after)
                or (body.nl and body.nl != spec.source_nl)
                or (ir.domain != spec.domain)
                or (body.demo and ir.model_dump(mode="json", by_alias=True) != recorded.get("ir"))
                or (context.skip_after is not None and (original_stop is None or updated_stop != original_stop))
            )
            if conflict:
                raise HTTPException(status_code=409, detail={"code": "changed_run_conditions", "message": "再验证必须保留原需求和运行条件。条件已改变，请作为新实验运行，不能记为原问题已修复。"})
            return ir, spec, spec.source_nl, context.skip_after
        if skip is not None and skip not in {node.id for node in ir.nodes}:
            raise HTTPException(status_code=400, detail={"code": "invalid_skip_node", "message": "运行中断位置不存在于工作流中，请检查节点编号。"})
        spec = compile_spec(nl, ir.domain)
        return ir, spec, nl, skip

    @application.post("/api/report/session")
    def api_report_session(body: SessionBody, user=Depends(current_user)):
        from veriflow_verify.history import record_session
        from veriflow_verify.pipeline import run_session

        ir, spec, nl, skip = resolve_report_inputs(body, user)
        session = run_session(ir, spec, nl=nl, skip_after=skip)
        with connect() as connection:
            run_id = record_session(connection, user["id"], session, parent_run_id=body.parent_run_id)
        payload = json.loads(session.model_dump_json())
        payload["run_id"] = run_id
        if body.parent_run_id:
            payload["parent_run_id"] = body.parent_run_id
        return payload

    @application.post("/api/report/export")
    def api_report_export(body: SessionBody, user=Depends(current_user)):
        from veriflow_verify.export import export_json, export_markdown
        from veriflow_verify.pipeline import run_session

        ir, spec, nl, skip = resolve_report_inputs(body, user)
        session = run_session(ir, spec, nl=nl, skip_after=skip)
        return {"markdown": export_markdown(session), "json": export_json(session)}

    @application.get("/api/report/history")
    def api_report_history(user=Depends(current_user), limit: int = Query(30)):
        from veriflow_verify.history import list_sessions

        with connect() as connection:
            return {"runs": list_sessions(connection, user["id"], limit=min(max(limit, 1), 100))}

    @application.get("/api/report/runs/{run_id}")
    def api_report_run(run_id: int, user=Depends(current_user)):
        from veriflow_verify.history import get_session

        with connect() as connection:
            row = get_session(connection, run_id)
        if row is None:
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": "run not found"})
        session = row.get("session")
        if not session:
            raise HTTPException(status_code=404, detail={"code": "no_payload", "message": "run has no stored session"})
        session["run_id"] = run_id
        if row.get("parent_run_id"):
            session["parent_run_id"] = row["parent_run_id"]
        return session

    @application.post("/api/report/compare")
    def api_report_compare(body: CompareBody, user=Depends(current_user)):
        del user
        from veriflow_verify.history import compare_sessions, get_session

        with connect() as connection:
            left = get_session(connection, body.left_id)
            right = get_session(connection, body.right_id)
        if not left or not right:
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": "run not found"})
        return compare_sessions(left, right)

    @application.get("/api/algorithms")
    def api_algorithms(user=Depends(current_user)):
        del user
        from veriflow_verify.algorithms import attach_benchmarks, list_algorithms, load_smoke_metrics

        attach_benchmarks(load_smoke_metrics())
        items = [item.model_dump() for item in list_algorithms()]
        det = sum(1 for item in items if item["deterministic"])
        return {
            "algorithms": items,
            "count": len(items),
            "deterministic": det,
            "ai_assisted": len(items) - det,
            "benchmark_version": (load_smoke_metrics() or {}).get("timestamp"),
        }

    @application.get("/api/algorithms/{algorithm_id}")
    def api_algorithm(algorithm_id: str, user=Depends(current_user)):
        del user
        from veriflow_verify.algorithms import attach_benchmarks, get_algorithm, load_smoke_metrics

        attach_benchmarks(load_smoke_metrics())
        item = get_algorithm(algorithm_id)
        if item is None:
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": "algorithm not found"})
        return item.model_dump()

    @application.post("/api/algorithms/{algorithm_id}/try")
    def api_algorithm_try(algorithm_id: str, body: AlgoTryBody, user=Depends(current_user)):
        del user
        ir = WorkflowIR.model_validate(body.ir)
        from veriflow_spec.compiler import compile_spec
        from veriflow_verify.sdk import ADAPTERS, run_algorithm

        if algorithm_id in ADAPTERS:
            spec = compile_spec(body.nl, ir.domain)
            return run_algorithm(
                algorithm_id,
                {"ir": ir, "spec": spec, "source": body.source, "target": body.target, "skip_after": body.skip_after},
            )
        if algorithm_id == "graph.reachability":
            from veriflow_ir.graph import shortest_path

            path = shortest_path(ir, body.source, body.target) if body.source and body.target else None
            return {"reachable": path is not None, "path": path or []}
        if algorithm_id == "runtime.alignment":
            from veriflow_runtime.align import align_trace
            from veriflow_runtime.mock_exec import mock_execute
            from veriflow_spec.compiler import compile_spec

            spec = compile_spec(body.nl, ir.domain)
            trace = mock_execute(ir, skip_after=body.skip_after)
            return json.loads(align_trace(ir, spec, trace).model_dump_json())
        raise HTTPException(status_code=400, detail={"code": "no_demo", "message": "no interactive demo for this algorithm"})

    @application.get("/api/semantics")
    def api_semantics(user=Depends(current_user)):
        del user
        from veriflow_ir.semantics import registry_dump

        return {"nodes": registry_dump()}

    @application.get("/api/bench/latest")
    def api_bench_latest(user=Depends(current_user)):
        del user
        from pathlib import Path

        root = Path(__file__).resolve().parents[3]
        preferred = [
            root / "experiments" / "runs" / "competition" / "metrics.json",
            root / "experiments" / "runs" / "dev" / "metrics.json",
            root / "experiments" / "runs" / "smoke" / "metrics.json",
        ]
        existing = [path for path in preferred if path.exists()]
        if not existing:
            return {"status": "NOT RUN", "metrics": None, "source": None, "note": "运行 python -m veriflow_cli bench"}
        path = existing[0]
        metrics = json.loads(path.read_text(encoding="utf-8"))
        relative = path.relative_to(root).as_posix()
        payload: dict[str, object] = {
            "status": "ok",
            "source": relative,
            "suite": metrics.get("suite") or ("dev" if "dev" in relative else "smoke"),
            "metrics": metrics,
            "note": metrics.get("note")
            or "仓库内 gold IR 故障注入。不是外部竞赛榜，禁止写成 SOTA。",
            "reproduce": metrics.get("command") or "python scripts/competition_benchmark.py",
        }
        ablation_path = path.parent / "ablation.json"
        llm_path = path.parent / "llm_judge.json"
        cases_path = path.parent / "cases.json"
        ablation = json.loads(ablation_path.read_text(encoding="utf-8")) if ablation_path.exists() else {}
        llm_judge = json.loads(llm_path.read_text(encoding="utf-8")) if llm_path.exists() else {}
        cases = json.loads(cases_path.read_text(encoding="utf-8")) if cases_path.exists() else []
        if ablation_path.exists():
            payload["ablation"] = ablation
        if llm_path.exists():
            payload["llm_judge"] = llm_judge
        payload["cases"] = cases
        payload["repair_failures"] = metrics.get("repair_failures") or []
        payload["category_counts"] = metrics.get("category_counts") or {}
        for key, value in metrics.items():
            if key not in payload:
                payload[key] = value
        static_row = ablation.get("no-runtime") if isinstance(ablation, dict) else None
        full_row = ablation.get("full") if isinstance(ablation, dict) else None
        llm_status = llm_judge.get("status") if isinstance(llm_judge, dict) else payload.get("llm_judge_baseline") or "NOT RUN"
        llm_metrics = llm_judge.get("metrics") if isinstance(llm_judge, dict) else None
        payload["baselines"] = {
            "accept_without_verifier": {
                "status": "ok",
                "label": "生成后直接接受（无 verifier）",
                "detection_recall": 0.0,
                "detection_f1": 0.0,
                "note": "对照基线：LLM 生成后不经检查。不是模型调用。",
            },
            "deterministic_static": {
                "status": "ok",
                "label": "确定性静态验证（no-runtime ablation）",
                "detection_f1": (static_row or {}).get("detection_f1"),
                "detection_recall": (static_row or {}).get("detection_recall"),
                "n": payload.get("n"),
                "note": "verify_workflow 全静态，不含 runtime monitor。判定不来自 LLM。",
            },
            "veriflow_hybrid": {
                "status": "ok",
                "label": "VeriFlow full",
                "detection_f1": (full_row or payload).get("detection_f1") if isinstance(full_row, dict) else payload.get("detection_f1"),
                "repair_success_rate": payload.get("repair_success_rate"),
                "fault_localization_accuracy": payload.get("fault_localization_accuracy"),
                "diagnosis_accuracy": payload.get("diagnosis_accuracy"),
                "note": "static + runtime + guarded repair。incremental speedup NOT MEASURED.",
            },
            "llm_as_judge": {
                "status": llm_status,
                "label": "LLM-as-judge",
                "detection_f1": (llm_metrics or {}).get("detection_f1") if isinstance(llm_metrics, dict) else None,
                "effective_f1": (llm_metrics or {}).get("effective_f1") if isinstance(llm_metrics, dict) else None,
                "evaluation_scope": llm_judge.get("evaluation_scope"),
                "eligible_case_count": llm_judge.get("eligible_case_count"),
                "reference_no_runtime": llm_judge.get("reference_no_runtime"),
                "reason": (
                    llm_judge.get("reason")
                    if isinstance(llm_judge, dict)
                    else "未执行模型打分（无评测 Key 或不允许用 LLM 当裁判）。禁止填假数。"
                ),
            },
        }
        return payload

    @application.post("/api/auth/login")
    def login(body: LoginBody):
        with connect() as connection:
            row = connection.execute(
                "SELECT id, name, role, password_hash, disabled FROM users WHERE name = ?",
                (body.username,),
            ).fetchone()
        if row is None or not verify_password(body.password, row["password_hash"]):
            raise HTTPException(
                status_code=401,
                detail={"code": "invalid_credentials", "message": "用户名或密码不正确"},
            )
        if int(row["disabled"] or 0) != 0:
            raise HTTPException(
                status_code=403,
                detail={"code": "account_disabled", "message": "账号已停用"},
            )
        token = create_session(row["id"])
        response = JSONResponse(
            {"token": token, "username": row["name"], "role": row["role"]}
        )
        response.set_cookie(
            "vf_session",
            token,
            httponly=True,
            samesite="lax",
            max_age=12 * 3600,
            path="/",
        )
        return response

    @application.get("/api/auth/me")
    def me(user=Depends(current_user)):
        with connect() as connection:
            submissions, solved = _user_stats(connection, user["id"])
        return {
            "username": user["name"],
            "role": user["role"],
            "submissions": submissions,
            "solved": solved,
        }

    @application.post("/api/auth/logout")
    def logout(
        authorization: Annotated[str | None, Header()] = None,
        vf_session: Annotated[str | None, Cookie()] = None,
    ):
        revoke_session(_bearer_token(authorization, vf_session))
        response = JSONResponse({"ok": True})
        response.delete_cookie("vf_session", path="/")
        return response

    @application.get("/api/problems")
    def list_problems():
        with connect() as connection:
            problems = connection.execute(
                """
                SELECT p.id, p.spec_json, p.difficulty, p.tags, p.kill_rate,
                       (SELECT COUNT(*) FROM submissions s
                        WHERE s.problem_id = p.id AND s.verdict = 'AC') AS ac_count,
                       (SELECT COUNT(*) FROM submissions s WHERE s.problem_id = p.id) AS sub_count,
                       (SELECT COUNT(*) FROM submissions s
                        WHERE s.problem_id = p.id AND s.verdict = 'AC'
                          AND s.counterexample_json IS NULL) AS hidden_ac
                FROM problems p
                WHERE p.published = 1
                ORDER BY p.id
                """
            ).fetchall()
        items = []
        for row in problems:
            spec = json.loads(row["spec_json"])
            sub_count = row["sub_count"] or 0
            ac_count = row["ac_count"] or 0
            items.append(
                {
                    "id": row["id"],
                    "title": spec.get("title"),
                    "difficulty": row["difficulty"],
                    "tags": json.loads(row["tags"]),
                    "ac_rate": (ac_count / sub_count) if sub_count else None,
                    "hidden_ac_rate": None,
                    "kill_rate": row["kill_rate"],
                }
            )
        return {"problems": items}

    @application.post("/api/problems/{problem_id}/mutate")
    def mutate_problem(problem_id: str, user=Depends(current_user)):
        del user
        rate = ensure_kill_rate(problem_id)
        return {"problem_id": problem_id, "kill_rate": rate}

    @application.get("/api/problems/{problem_id}")
    def get_problem(problem_id: str):
        with connect() as connection:
            row = connection.execute(
                "SELECT id, spec_json, statement, difficulty, tags, kill_rate FROM problems WHERE id = ?",
                (problem_id,),
            ).fetchone()
            public_tests = connection.execute(
                "SELECT name, stdin, stdout FROM tests WHERE problem_id = ? AND visibility = 'public' ORDER BY name",
                (problem_id,),
            ).fetchall()
        if row is None:
            raise HTTPException(
                status_code=404, detail={"code": "not_found", "message": "problem not found"}
            )
        spec = json.loads(row["spec_json"])
        spec.pop("hidden_policy", None)
        has_brute = bool(spec.get("has_brute") and pack_file(problem_id, "brute.py"))
        has_gen = pack_file(problem_id, "gen.py") is not None
        return {
            "id": row["id"],
            "title": spec.get("title"),
            "statement": row["statement"],
            "difficulty": row["difficulty"],
            "tags": json.loads(row["tags"]),
            "spec": spec,
            "has_brute": has_brute,
            "has_gen": has_gen,
            "kill_rate": row["kill_rate"],
            "public_tests": [
                {"name": item["name"], "stdin": item["stdin"], "stdout": item["stdout"]}
                for item in public_tests
            ],
        }

    @application.get("/api/problems/{problem_id}/kit")
    def problem_kit(problem_id: str, user=Depends(current_user)):
        del user
        with connect() as connection:
            row = connection.execute(
                "SELECT id, spec_json FROM problems WHERE id = ? AND published = 1",
                (problem_id,),
            ).fetchone()
        if row is None:
            raise HTTPException(
                status_code=404, detail={"code": "not_found", "message": "problem not found"}
            )
        spec = json.loads(row["spec_json"])
        brute_source = pack_file(problem_id, "brute.py")
        gen_source = pack_file(problem_id, "gen.py")
        return {
            "id": problem_id,
            "title": spec.get("title"),
            "has_brute": bool(brute_source),
            "has_gen": bool(gen_source),
            "gen_source": gen_source,
            "brute_source": brute_source,
            "time_limit_ms": spec.get("time_limit_ms", 1000),
            "memory_limit_mb": spec.get("memory_limit_mb", 256),
        }

    @application.post("/api/problems/{problem_id}/submit")
    def submit_problem(problem_id: str, body: SubmitBody, user=Depends(current_user)):
        return grade_submission(user["id"], problem_id, body.lang, body.source)

    @application.post("/api/problems/{problem_id}/solve")
    def solve_problem(problem_id: str, body: SolveBody, user=Depends(current_user)):
        with connect() as connection:
            problem = connection.execute(
                "SELECT statement FROM problems WHERE id = ? AND published = 1",
                (problem_id,),
            ).fetchone()
        if problem is None:
            raise HTTPException(
                status_code=404, detail={"code": "not_found", "message": "problem not found"}
            )
        source, backend = draft_solution(problem["statement"], body.lang)
        payload = grade_submission(user["id"], problem_id, body.lang, source)
        payload["solver"] = backend
        payload["source"] = source
        return payload

    @application.post("/api/problems/{problem_id}/tutor")
    def tutor_problem(problem_id: str, body: TutorBody, user=Depends(current_user)):
        hour_prefix = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H")
        with connect() as connection:
            used = connection.execute(
                """
                SELECT COUNT(*) AS n FROM tutor_logs
                WHERE user_id = ? AND created_at LIKE ?
                """,
                (user["id"], hour_prefix + "%"),
            ).fetchone()["n"]
            if used >= 30:
                raise HTTPException(
                    status_code=429,
                    detail={"code": "rate_limited", "message": "教练本小时次数用尽"},
                )
            submission = connection.execute(
                """
                SELECT id, problem_id, user_id, verdict, counterexample_json
                FROM submissions WHERE id = ?
                """,
                (body.submission_id,),
            ).fetchone()
            problem = connection.execute(
                "SELECT statement, spec_json FROM problems WHERE id = ?",
                (problem_id,),
            ).fetchone()
        if submission is None or submission["user_id"] != user["id"]:
            raise HTTPException(
                status_code=404, detail={"code": "not_found", "message": "submission not found"}
            )
        if submission["problem_id"] != problem_id:
            raise HTTPException(
                status_code=400, detail={"code": "mismatch", "message": "submission 不属于这题"}
            )
        if submission["verdict"] not in {"WA", "RE"} or not submission["counterexample_json"]:
            raise HTTPException(
                status_code=400,
                detail={"code": "not_failed", "message": "只在有反例的 WA/RE 上启用教练"},
            )
        if problem is None:
            raise HTTPException(
                status_code=404, detail={"code": "not_found", "message": "problem not found"}
            )
        spec = json.loads(problem["spec_json"])
        counterexample = json.loads(submission["counterexample_json"])
        question, backend, rejects = ask_tutor(
            counterexample,
            problem["statement"],
            spec.get("invariants") or [],
        )
        now = datetime.now(timezone.utc).isoformat()
        with connect() as connection:
            connection.execute(
                """
                INSERT INTO tutor_logs(
                    user_id, submission_id, question, backend, spoiler_rejects, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (user["id"], body.submission_id, question, backend, rejects, now),
            )
            connection.commit()
        return {
            "question": question,
            "backend": backend,
            "spoiler_rejects": rejects,
        }

    @application.post("/api/problems/{problem_id}/contrast")
    def contrast_problem(problem_id: str, body: ContrastBody, user=Depends(current_user)):
        hour_prefix = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H")
        with connect() as connection:
            used = connection.execute(
                """
                SELECT COUNT(*) AS n FROM (
                    SELECT created_at FROM tutor_logs WHERE user_id = ? AND created_at LIKE ?
                    UNION ALL
                    SELECT created_at FROM contrast_logs WHERE user_id = ? AND created_at LIKE ?
                )
                """,
                (user["id"], hour_prefix + "%", user["id"], hour_prefix + "%"),
            ).fetchone()["n"]
            if used >= 30:
                raise HTTPException(
                    status_code=429,
                    detail={"code": "rate_limited", "message": "对照本小时次数用尽"},
                )
            submission = connection.execute(
                """
                SELECT id, problem_id, user_id, lang, source, verdict, counterexample_json
                FROM submissions WHERE id = ?
                """,
                (body.submission_id,),
            ).fetchone()
            problem = connection.execute(
                "SELECT statement, spec_json FROM problems WHERE id = ? AND published = 1",
                (problem_id,),
            ).fetchone()
            tests = connection.execute(
                "SELECT name, stdin, stdout, visibility FROM tests WHERE problem_id = ?",
                (problem_id,),
            ).fetchall()
        if submission is None or submission["user_id"] != user["id"]:
            raise HTTPException(
                status_code=404, detail={"code": "not_found", "message": "submission not found"}
            )
        if submission["problem_id"] != problem_id:
            raise HTTPException(
                status_code=400, detail={"code": "mismatch", "message": "submission 不属于这题"}
            )
        if submission["verdict"] not in {"WA", "RE"} or not submission["counterexample_json"]:
            raise HTTPException(
                status_code=400,
                detail={"code": "not_failed", "message": "只在有反例的 WA/RE 上对照"},
            )
        if problem is None:
            raise HTTPException(
                status_code=404, detail={"code": "not_found", "message": "problem not found"}
            )
        spec = json.loads(problem["spec_json"])
        counterexample = json.loads(submission["counterexample_json"])
        lang = submission["lang"]
        time_ms = spec.get("time_limit_ms", 1000)
        mem_mb = spec.get("memory_limit_mb", 256)
        full_cases = [
            Case(stdin=row["stdin"], stdout=row["stdout"], visibility=row["visibility"], name=row["name"])
            for row in tests
        ]
        ce_only = [ce_case(counterexample)]
        solver = "none"
        reference = None
        guess = ""
        note = ""
        proposed, backend, guess = propose_aligned(
            submission["source"], problem["statement"], lang, counterexample
        )
        if proposed and passes_tests(lang, proposed, ce_only, time_ms, mem_mb):
            reference = proposed
            solver = backend
            if passes_tests(lang, proposed, full_cases, time_ms, mem_mb):
                note = "近邻代码已在公开和隐藏测试上通过沙箱。"
            else:
                note = "近邻代码过了这组反例，完整测试未全过。仍展示，不当成整题 AC。"
        if reference is None:
            brute = pack_file(problem_id, "brute.py")
            if brute and passes_tests("python3", brute, ce_only, time_ms, mem_mb):
                reference = brute
                solver = "brute"
                guess = ""
                note = "模型这份在反例上没过或未配置，已回退到本题暴力解。沙箱已在这组反例上跑过。"
        if reference is None:
            note = "没有可展示的对照：模型代码未过这组反例，本题也没有可用暴力解。不展示假正解。"
        payload = {
            "solver": solver,
            "reference_source": reference,
            "reference_lang": "python3" if solver == "brute" else lang,
            "user_source": submission["source"],
            "user_lang": lang,
            "guess": guess,
            "note": note,
            "counterexample": counterexample,
        }
        now = datetime.now(timezone.utc).isoformat()
        with connect() as connection:
            connection.execute(
                """
                INSERT INTO contrast_logs(user_id, submission_id, solver, guess, payload_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (user["id"], body.submission_id, solver, guess, json.dumps(payload, ensure_ascii=False), now),
            )
            connection.commit()
        return payload

    @application.get("/api/problems/{problem_id}/review")
    def review_problem(problem_id: str, user=Depends(current_user)):
        with connect() as connection:
            submission = connection.execute(
                """
                SELECT id, lang, source, verdict, time_ms, counterexample_json
                FROM submissions
                WHERE user_id = ? AND problem_id = ?
                ORDER BY id DESC LIMIT 1
                """,
                (user["id"], problem_id),
            ).fetchone()
            contrast = None
            if submission is not None:
                contrast = connection.execute(
                    """
                    SELECT payload_json FROM contrast_logs
                    WHERE user_id = ? AND submission_id = ?
                    ORDER BY id DESC LIMIT 1
                    """,
                    (user["id"], submission["id"]),
                ).fetchone()
        if submission is None:
            return {"submission": None, "contrast": None}
        counterexample = json.loads(submission["counterexample_json"]) if submission["counterexample_json"] else None
        payload = None
        if contrast and contrast["payload_json"]:
            payload = json.loads(contrast["payload_json"])
        return {
            "submission": {
                "job_id": "",
                "submission_id": submission["id"],
                "verdict": submission["verdict"],
                "stage": "running_hidden" if submission["verdict"] in {"WA", "RE"} else "done",
                "time_ms": submission["time_ms"] or 0,
                "counterexample": counterexample,
                "sandbox": "",
                "source": submission["source"],
                "lang": submission["lang"],
            },
            "contrast": payload,
        }

    @application.post("/api/problems/{problem_id}/stress")
    def stress_problem(problem_id: str, body: StressBody, user=Depends(current_user)):
        with connect() as connection:
            problem = connection.execute(
                "SELECT id, spec_json FROM problems WHERE id = ? AND published = 1",
                (problem_id,),
            ).fetchone()
        if problem is None:
            raise HTTPException(
                status_code=404, detail={"code": "not_found", "message": "problem not found"}
            )
        spec = json.loads(problem["spec_json"])
        gen_source = body.gen_source or pack_file(problem_id, "gen.py")
        brute_source = body.brute_source or pack_file(problem_id, "brute.py")
        if not brute_source:
            raise HTTPException(
                status_code=400,
                detail={"code": "no_brute", "message": "本题不提供暴力解，对拍不可用"},
            )
        if not gen_source:
            raise HTTPException(
                status_code=400,
                detail={"code": "no_gen", "message": "本题没有生成器"},
            )
        try:
            sandbox = get_sandbox()
        except SandboxUnavailable as exc:
            raise HTTPException(status_code=503, detail={"code": "sandbox_down", "message": str(exc)}) from exc
        result = run_stress(
            sandbox,
            StressProgram(lang=body.gen_lang, source=gen_source, role="gen"),
            StressProgram(lang=body.brute_lang, source=brute_source, role="brute"),
            StressProgram(lang=body.sol_lang, source=body.sol_source, role="sol"),
            body.rounds,
            spec.get("time_limit_ms", 1000),
            spec.get("memory_limit_mb", 256),
        )
        now = datetime.now(timezone.utc).isoformat()
        with connect() as connection:
            connection.execute(
                """
                INSERT INTO stress_runs(
                    problem_id, user_id, status, rounds, round_hit, counterexample_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    problem_id,
                    user["id"],
                    result.status,
                    result.rounds_ran,
                    result.rounds_ran if result.status != "no_fail" else None,
                    json.dumps(result.counterexample, ensure_ascii=False)
                    if result.counterexample
                    else None,
                    now,
                ),
            )
            connection.commit()
        return {
            "status": result.status,
            "rounds_ran": result.rounds_ran,
            "time_ms": result.time_ms,
            "sandbox": result.sandbox,
            "counterexample": result.counterexample,
            "compile_log": result.compile_log,
            "detail": result.detail,
            "failed_role": result.failed_role,
            "log": result.log,
        }

    @application.get("/api/jobs/{job_id}")
    def get_job(job_id: str, user=Depends(current_user)):
        with connect() as connection:
            job = connection.execute(
                "SELECT * FROM jobs WHERE id = ?", (job_id,)
            ).fetchone()
            submission = None
            if job and job["submission_id"]:
                submission = connection.execute(
                    "SELECT * FROM submissions WHERE id = ? AND user_id = ?",
                    (job["submission_id"], user["id"]),
                ).fetchone()
        if job is None:
            raise HTTPException(
                status_code=404, detail={"code": "not_found", "message": "job not found"}
            )
        payload = {
            "id": job["id"],
            "type": job["type"],
            "status": job["status"],
            "error": job["error"],
        }
        if submission:
            payload["verdict"] = submission["verdict"]
            payload["counterexample"] = (
                json.loads(submission["counterexample_json"])
                if submission["counterexample_json"]
                else None
            )
            payload["time_ms"] = submission["time_ms"]
        return payload

    @application.post("/api/compose")
    def compose_create(body: ComposeNL, user=Depends(current_user)):
        return compose_service.create_from_nl(user["id"], body.nl, allow_ai=body.allow_ai)

    @application.post("/api/compose/example")
    def compose_example(body: ComposeExample, user=Depends(current_user)):
        try:
            return compose_service.create_from_example(user["id"], body.name)
        except ValueError:
            raise HTTPException(
                status_code=400, detail={"code": "bad_example", "message": "unknown example"}
            )

    @application.get("/api/compose")
    def compose_list(user=Depends(current_user)):
        return {"projects": compose_service.list_projects(user["id"])}

    @application.get("/api/compose/{project_id}")
    def compose_get(project_id: int, user=Depends(current_user)):
        row = compose_service.get_project(user["id"], project_id)
        if row is None:
            raise HTTPException(
                status_code=404, detail={"code": "not_found", "message": "project not found"}
            )
        return compose_service.project_payload(row)

    @application.post("/api/compose/{project_id}/ir")
    def compose_save_ir(project_id: int, body: ComposeIRBody, user=Depends(current_user)):
        ir = WorkflowIR.model_validate(body.ir)
        payload = compose_service.save_ir(user["id"], project_id, ir)
        if payload is None:
            raise HTTPException(
                status_code=404, detail={"code": "not_found", "message": "project not found"}
            )
        return payload

    @application.post("/api/compose/{project_id}/repair")
    def compose_repair(project_id: int, body: ComposeNL, user=Depends(current_user)):
        payload = compose_service.repair(user["id"], project_id, body.nl, allow_ai=body.allow_ai)
        if payload is None:
            raise HTTPException(
                status_code=404, detail={"code": "not_found", "message": "project not found"}
            )
        return payload

    @application.post("/api/compose/{project_id}/verify-repair")
    def compose_verify_repair(project_id: int, body: AllowAiBody | None = None, user=Depends(current_user)):
        allow_ai = True if body is None else body.allow_ai
        max_iterations = 3 if body is None else body.max_iterations
        payload = compose_service.guarded_repair(
            user["id"], project_id, max_iterations=max_iterations, allow_ai=allow_ai
        )
        if payload is None:
            raise HTTPException(
                status_code=404, detail={"code": "not_found", "message": "project not found"}
            )
        return payload

    @application.post("/api/compose/{project_id}/gate")
    def compose_gate(project_id: int, body: ComposeGate, user=Depends(current_user)):
        try:
            payload = compose_service.set_gate(user["id"], project_id, body.decision)
        except PermissionError:
            raise HTTPException(
                status_code=409,
                detail={"code": "blocked", "message": "静态错误未清，不能过审"},
            )
        if payload is None:
            raise HTTPException(
                status_code=404, detail={"code": "not_found", "message": "project not found"}
            )
        return payload

    @application.post("/api/compose/{project_id}/publish")
    def compose_publish(project_id: int, user=Depends(current_user)):
        try:
            payload = compose_service.publish(user["id"], project_id)
        except PermissionError as exc:
            code = str(exc)
            messages = {
                "static errors": "静态检查未通过",
                "gate": "审题门尚未通过",
                "weak_tests": "弱测资攻击未解除，不能入库",
            }
            raise HTTPException(
                status_code=409,
                detail={"code": code, "message": messages.get(code, "不能入库")},
            )
        if payload is None:
            raise HTTPException(
                status_code=404, detail={"code": "not_found", "message": "project not found"}
            )
        return payload

    @application.get("/api/submissions")
    def list_submissions(user=Depends(current_user)):
        with connect() as connection:
            rows = connection.execute(
                """
                SELECT id, problem_id, lang, verdict, time_ms, created_at
                FROM submissions
                WHERE user_id = ?
                ORDER BY id DESC
                LIMIT 100
                """,
                (user["id"],),
            ).fetchall()
        return {
            "submissions": [
                {
                    "id": row["id"],
                    "problem_id": row["problem_id"],
                    "lang": row["lang"],
                    "verdict": row["verdict"],
                    "time_ms": row["time_ms"],
                    "created_at": row["created_at"],
                }
                for row in rows
            ]
        }

    @application.get("/api/submissions/{submission_id}")
    def get_submission(submission_id: int, user=Depends(current_user)):
        with connect() as connection:
            row = connection.execute(
                """
                SELECT id, user_id, problem_id, lang, source, verdict, time_ms,
                       counterexample_json, created_at
                FROM submissions WHERE id = ?
                """,
                (submission_id,),
            ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": "没有这条提交"})
        if row["user_id"] != user["id"] and user["role"] != "admin":
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": "没有这条提交"})
        counterexample = None
        if row["counterexample_json"]:
            try:
                counterexample = json.loads(row["counterexample_json"])
            except json.JSONDecodeError:
                counterexample = None
        return {
            "id": row["id"],
            "problem_id": row["problem_id"],
            "lang": row["lang"],
            "source": row["source"],
            "verdict": row["verdict"],
            "time_ms": row["time_ms"],
            "counterexample": counterexample,
            "created_at": row["created_at"],
        }

    @application.get("/api/admin/users")
    def admin_users(user=Depends(require_admin)):
        del user
        with connect() as connection:
            rows = connection.execute(
                """
                SELECT u.id, u.name, u.role, u.disabled,
                       (SELECT COUNT(*) FROM submissions s WHERE s.user_id = u.id) AS submissions,
                       (SELECT COUNT(DISTINCT s.problem_id) FROM submissions s
                        WHERE s.user_id = u.id AND s.verdict = 'AC') AS solved
                FROM users u
                ORDER BY u.id
                """
            ).fetchall()
        return {
            "users": [
                {
                    "id": row["id"],
                    "username": row["name"],
                    "role": row["role"],
                    "disabled": bool(row["disabled"]),
                    "submissions": int(row["submissions"] or 0),
                    "solved": int(row["solved"] or 0),
                }
                for row in rows
            ]
        }

    @application.post("/api/admin/users")
    def admin_create_user(body: AdminCreateUserBody, user=Depends(require_admin)):
        del user
        name = body.username.strip()
        if not name.replace("_", "").isalnum() or name.replace("_", "").isdigit():
            raise HTTPException(status_code=400, detail={"code": "bad_name", "message": "用户名只用字母、数字和下划线"})
        with connect() as connection:
            exists = connection.execute("SELECT id FROM users WHERE name = ?", (name,)).fetchone()
            if exists:
                raise HTTPException(status_code=409, detail={"code": "exists", "message": "这个用户名已经有了"})
            connection.execute(
                "INSERT INTO users(name, password_hash, role, disabled) VALUES (?, ?, ?, 0)",
                (name, hash_password(body.password), body.role),
            )
            connection.commit()
            row = connection.execute(
                "SELECT id, name, role, disabled FROM users WHERE name = ?", (name,)
            ).fetchone()
        return {"id": row["id"], "username": row["name"], "role": row["role"], "disabled": False, "submissions": 0, "solved": 0}

    @application.post("/api/admin/users/{user_id}/disabled")
    def admin_disable_user(user_id: int, body: AdminDisableBody, user=Depends(require_admin)):
        if user_id == user["id"] and body.disabled:
            raise HTTPException(status_code=409, detail={"code": "self", "message": "不能停用自己"})
        with connect() as connection:
            row = connection.execute("SELECT id, role, disabled FROM users WHERE id = ?", (user_id,)).fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail={"code": "not_found", "message": "没有这个账号"})
            if row["role"] == "admin" and body.disabled:
                others = connection.execute(
                    "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0 AND id != ?",
                    (user_id,),
                ).fetchone()["n"]
                if int(others or 0) < 1:
                    raise HTTPException(status_code=409, detail={"code": "last_admin", "message": "至少留一个管理员"})
            connection.execute("UPDATE users SET disabled = ? WHERE id = ?", (1 if body.disabled else 0, user_id))
            if body.disabled:
                connection.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
            connection.commit()
        return {"ok": True, "disabled": body.disabled}

    @application.get("/api/admin/problems")
    def admin_problems(user=Depends(require_admin)):
        del user
        with connect() as connection:
            rows = connection.execute(
                """
                SELECT p.id, p.spec_json, p.difficulty, p.published,
                       (SELECT COUNT(*) FROM submissions s WHERE s.problem_id = p.id) AS sub_count
                FROM problems p
                ORDER BY p.id
                """
            ).fetchall()
        items = []
        for row in rows:
            spec = json.loads(row["spec_json"])
            items.append(
                {
                    "id": row["id"],
                    "title": spec.get("title"),
                    "difficulty": row["difficulty"],
                    "published": bool(row["published"]),
                    "submissions": int(row["sub_count"] or 0),
                }
            )
        return {"problems": items}

    @application.post("/api/admin/problems/{problem_id}/publish")
    def admin_publish_problem(problem_id: str, body: AdminPublishBody, user=Depends(require_admin)):
        del user
        with connect() as connection:
            row = connection.execute("SELECT id FROM problems WHERE id = ?", (problem_id,)).fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail={"code": "not_found", "message": "没有这道题"})
            connection.execute(
                "UPDATE problems SET published = ? WHERE id = ?",
                (1 if body.published else 0, problem_id),
            )
            connection.commit()
        return {"ok": True, "published": body.published}


app = create_app()
