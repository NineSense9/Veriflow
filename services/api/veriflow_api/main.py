from __future__ import annotations

import json
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import Cookie, Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from veriflow_api.auth import create_session, user_for_token, verify_password
from veriflow_api.db import connect, init_db
from veriflow_api.seed import seed
from veriflow_ir.workflow import WorkflowIR
from veriflow_sandbox.factory import get_sandbox, sandbox_mode
from veriflow_sandbox.judge import Case, judge_submission
from veriflow_staticcheck.check import check_workflow


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


class SubmitBody(BaseModel):
    lang: Literal["python3", "cpp17"]
    source: str = Field(min_length=1, max_length=200_000)


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


def _register_routes(application: FastAPI) -> None:
    @application.get("/api/health")
    def health() -> dict[str, object]:
        mode = sandbox_mode()
        return {"ok": mode != "sandbox_down", "sandbox": mode}

    @application.post("/api/compose/check")
    def compose_check(ir: WorkflowIR) -> dict[str, object]:
        errors = check_workflow(ir)
        return {"ok": len(errors) == 0, "errors": [error.model_dump() for error in errors]}

    @application.post("/api/auth/login")
    def login(body: LoginBody):
        with connect() as connection:
            row = connection.execute(
                "SELECT id, name, role, password_hash FROM users WHERE name = ?",
                (body.username,),
            ).fetchone()
        if row is None or not verify_password(body.password, row["password_hash"]):
            raise HTTPException(
                status_code=401,
                detail={"code": "invalid_credentials", "message": "wrong username or password"},
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
        )
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

    @application.get("/api/problems/{problem_id}")
    def get_problem(problem_id: str):
        with connect() as connection:
            row = connection.execute(
                "SELECT id, spec_json, statement, difficulty, tags FROM problems WHERE id = ?",
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
        return {
            "id": row["id"],
            "title": spec.get("title"),
            "statement": row["statement"],
            "difficulty": row["difficulty"],
            "tags": json.loads(row["tags"]),
            "spec": spec,
            "public_tests": [
                {"name": item["name"], "stdin": item["stdin"], "stdout": item["stdout"]}
                for item in public_tests
            ],
        }

    @application.post("/api/problems/{problem_id}/submit")
    def submit_problem(problem_id: str, body: SubmitBody, user=Depends(current_user)):
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
                (user["id"], problem_id, body.lang, body.source, "queued", job_id, now),
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
        result = judge_submission(
            get_sandbox(),
            body.lang,
            body.source,
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
        return {
            "job_id": job_id,
            "submission_id": submission_id,
            "verdict": result.verdict,
            "stage": result.stage,
            "time_ms": result.time_ms,
            "counterexample": result.counterexample,
            "sandbox": result.sandbox,
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


app = create_app()
