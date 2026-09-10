from __future__ import annotations

from dataclasses import dataclass, field

from veriflow_compare.tokens import outputs_equal
from veriflow_sandbox.types import Lang, Sandbox


@dataclass
class Case:
    stdin: str
    stdout: str
    visibility: str
    name: str = ""


@dataclass
class JudgeResult:
    verdict: str
    stage: str
    time_ms: int
    memory_kb: int | None = None
    counterexample: dict | None = None
    compile_log: str | None = None
    detail: str | None = None
    sandbox: str = "process"
    tests_passed: int = 0
    tests_run: int = 0
    trace: list[dict] = field(default_factory=list)


def judge_submission(
    sandbox: Sandbox,
    lang: Lang,
    source: str,
    tests: list[Case],
    time_limit_ms: int,
    memory_limit_mb: int,
) -> JudgeResult:
    compile_result = sandbox.compile(lang, source)
    if not compile_result.ok:
        return JudgeResult(
            verdict="CE",
            stage="compiling",
            time_ms=compile_result.time_ms,
            compile_log=compile_result.log,
            sandbox=sandbox.name,
        )
    ordered = _smallest_first(tests)
    public = [case for case in ordered if case.visibility == "public"]
    hidden = [case for case in ordered if case.visibility == "hidden"]
    passed = 0
    total_time = compile_result.time_ms
    for stage, group in (("running_public", public), ("running_hidden", hidden)):
        for case in group:
            run = sandbox.run(
                lang,
                compile_result.artifact or "",
                case.stdin,
                time_limit_ms,
                memory_limit_mb,
            )
            total_time += run.time_ms
            event = {
                "stage": stage,
                "name": case.name,
                "visibility": case.visibility,
                "verdict": run.verdict,
                "time_ms": run.time_ms,
            }
            if run.verdict != "OK":
                return JudgeResult(
                    verdict=run.verdict,
                    stage=stage,
                    time_ms=total_time,
                    memory_kb=run.memory_kb,
                    counterexample=_counterexample(case, run.stdout, run.verdict),
                    detail=run.detail,
                    sandbox=sandbox.name,
                    tests_passed=passed,
                    tests_run=passed + 1,
                    trace=[event],
                )
            if not outputs_equal(run.stdout, case.stdout):
                event["verdict"] = "WA"
                return JudgeResult(
                    verdict="WA",
                    stage=stage,
                    time_ms=total_time,
                    memory_kb=run.memory_kb,
                    counterexample=_counterexample(case, run.stdout, "WA"),
                    sandbox=sandbox.name,
                    tests_passed=passed,
                    tests_run=passed + 1,
                    trace=[event],
                )
            passed += 1
    return JudgeResult(
        verdict="AC",
        stage="accepted",
        time_ms=total_time,
        sandbox=sandbox.name,
        tests_passed=passed,
        tests_run=passed,
    )


def _smallest_first(tests: list[Case]) -> list[Case]:
    indexed = list(enumerate(tests))
    indexed.sort(key=lambda item: (len(item[1].stdin), item[0]))
    return [item[1] for item in indexed]


def _counterexample(case: Case, actual: str, verdict: str) -> dict:
    return {
        "stdin": case.stdin,
        "expected": case.stdout,
        "actual": actual,
        "source": case.visibility,
        "name": case.name,
        "verdict": verdict,
    }
