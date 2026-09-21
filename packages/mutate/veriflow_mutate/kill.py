from __future__ import annotations

from veriflow_compare.tokens import outputs_equal
from veriflow_mutate.ops import mutate_source
from veriflow_sandbox.process import ProcessSandbox
from veriflow_sandbox.resources import cleanup_artifacts


def kill_rate(
    ref_source: str,
    tests: list[tuple[str, str]],
    time_limit_ms: int = 1000,
    memory_limit_mb: int = 256,
) -> dict:
    mutants = mutate_source(ref_source)
    if not mutants or not tests:
        return {"kill_rate": None, "killed": 0, "total": 0, "operators": []}
    sandbox = ProcessSandbox()
    killed = 0
    operators: list[dict] = []
    for name, source in mutants:
        compiled = sandbox.compile("python3", source)
        try:
            dead = not compiled.ok
            if not dead:
                for stdin, expected in tests:
                    run = sandbox.run(
                        "python3",
                        compiled.artifact or "",
                        stdin,
                        time_limit_ms,
                        memory_limit_mb,
                    )
                    if run.verdict != "OK" or not outputs_equal(run.stdout, expected):
                        dead = True
                        break
        finally:
            cleanup_artifacts(sandbox, [compiled.artifact] if compiled.artifact else [])
        if dead:
            killed += 1
        operators.append({"name": name, "killed": dead})
    total = len(mutants)
    return {
        "kill_rate": killed / total if total else None,
        "killed": killed,
        "total": total,
        "operators": operators,
    }
