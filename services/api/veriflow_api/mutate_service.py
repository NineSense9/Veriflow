from __future__ import annotations

from veriflow_api.db import connect
from veriflow_api.seed import pack_file
from veriflow_mutate.kill import kill_rate as compute


def ensure_kill_rate(problem_id: str) -> float | None:
    with connect() as connection:
        row = connection.execute(
            "SELECT kill_rate FROM problems WHERE id = ?", (problem_id,)
        ).fetchone()
        tests = connection.execute(
            "SELECT stdin, stdout FROM tests WHERE problem_id = ?",
            (problem_id,),
        ).fetchall()
    if row is None:
        return None
    if row["kill_rate"] is not None:
        return float(row["kill_rate"])
    ref = pack_file(problem_id, "ref.py")
    if not ref or not tests:
        return None
    result = compute(ref, [(item["stdin"], item["stdout"]) for item in tests])
    rate = result["kill_rate"]
    with connect() as connection:
        connection.execute(
            "UPDATE problems SET kill_rate = ? WHERE id = ?", (rate, problem_id)
        )
        connection.commit()
    return rate
