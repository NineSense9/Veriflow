from __future__ import annotations

from dataclasses import dataclass, field

from veriflow_compare.tokens import outputs_equal
from veriflow_sandbox.types import Lang, Sandbox
from veriflow_sandbox.resources import cleanup_artifacts


@dataclass
class StressProgram:
    lang: Lang
    source: str
    role: str


@dataclass
class StressResult:
    status: str
    rounds_ran: int
    time_ms: int
    sandbox: str
    counterexample: dict | None = None
    compile_log: str | None = None
    detail: str | None = None
    failed_role: str | None = None
    log: list[dict] = field(default_factory=list)


def run_stress(
    sandbox: Sandbox,
    generator: StressProgram,
    brute: StressProgram,
    solution: StressProgram,
    rounds: int,
    time_limit_ms: int,
    memory_limit_mb: int,
) -> StressResult:
    if hasattr(sandbox, "stress") and callable(getattr(sandbox, "stress")):
        return sandbox.stress(
            generator, brute, solution, rounds, time_limit_ms, memory_limit_mb
        )
    artifacts: list[str] = []
    try:
        compiled = {}
        total_time = 0
        for program in (generator, brute, solution):
            result = sandbox.compile(program.lang, program.source)
            if result.artifact:
                artifacts.append(result.artifact)
            total_time += result.time_ms
            if not result.ok:
                status = "CE" if program.role == "sol" else "stress_error"
                return StressResult(
                    status=status,
                    rounds_ran=0,
                    time_ms=total_time,
                    sandbox=sandbox.name,
                    compile_log=result.log,
                    detail=f"{program.role}_compile",
                    failed_role=program.role,
                )
            compiled[program.role] = (program.lang, result.artifact or "")

        log: list[dict] = []
        for index in range(1, rounds + 1):
            generated = sandbox.run(
                compiled["gen"][0],
                compiled["gen"][1],
                "",
                time_limit_ms,
                memory_limit_mb,
            )
            total_time += generated.time_ms
            if generated.verdict != "OK":
                return StressResult(
                    status="stress_error",
                    rounds_ran=index,
                    time_ms=total_time,
                    sandbox=sandbox.name,
                    detail=f"gen_{generated.verdict.lower()}",
                    failed_role="gen",
                    log=log + [{"round": index, "status": generated.verdict, "role": "gen"}],
                )
            expected = sandbox.run(
                compiled["brute"][0],
                compiled["brute"][1],
                generated.stdout,
                time_limit_ms,
                memory_limit_mb,
            )
            total_time += expected.time_ms
            if expected.verdict != "OK":
                return StressResult(
                    status="stress_error",
                    rounds_ran=index,
                    time_ms=total_time,
                    sandbox=sandbox.name,
                    detail=f"brute_{expected.verdict.lower()}",
                    failed_role="brute",
                    counterexample={
                        "stdin": generated.stdout,
                        "expected": "",
                        "actual": expected.stdout,
                        "source": "stress",
                        "verdict": expected.verdict,
                    },
                    log=log + [{"round": index, "status": expected.verdict, "role": "brute"}],
                )
            actual = sandbox.run(
                compiled["sol"][0],
                compiled["sol"][1],
                generated.stdout,
                time_limit_ms,
                memory_limit_mb,
            )
            total_time += actual.time_ms
            if actual.verdict != "OK":
                return StressResult(
                    status=actual.verdict,
                    rounds_ran=index,
                    time_ms=total_time,
                    sandbox=sandbox.name,
                    failed_role="sol",
                    counterexample={
                        "stdin": generated.stdout,
                        "expected": expected.stdout,
                        "actual": actual.stdout,
                        "source": "stress",
                        "verdict": actual.verdict,
                    },
                    log=log + [{"round": index, "status": actual.verdict, "role": "sol"}],
                )
            if not outputs_equal(actual.stdout, expected.stdout):
                return StressResult(
                    status="mismatch",
                    rounds_ran=index,
                    time_ms=total_time,
                    sandbox=sandbox.name,
                    failed_role="sol",
                    counterexample={
                        "stdin": generated.stdout,
                        "expected": expected.stdout,
                        "actual": actual.stdout,
                        "source": "stress",
                        "verdict": "WA",
                    },
                    log=log + [{"round": index, "status": "mismatch", "role": "sol"}],
                )
            log.append({"round": index, "status": "ok"})
        return StressResult(
            status="no_fail",
            rounds_ran=rounds,
            time_ms=total_time,
            sandbox=sandbox.name,
            log=log,
        )
    finally:
        cleanup_artifacts(sandbox, artifacts)
