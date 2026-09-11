from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from veriflow_runtime.models import ConformanceResult
from veriflow_spec.models import WorkflowSpec
from veriflow_verify.result import VerificationResult

Cell = str  # PASS FAIL UNKNOWN NOT_APPLICABLE
DIMS = ("structural", "semantic", "dataflow", "runtime", "safety", "evidence")


class MatrixCell(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Cell
    evidence: str = ""
    algorithm_id: str = ""


class MatrixRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    constraint_id: str
    requirement: str
    constraint_type: str
    cells: dict[str, MatrixCell] = Field(default_factory=dict)


class VerificationMatrix(BaseModel):
    model_config = ConfigDict(extra="forbid")

    columns: list[str] = Field(default_factory=lambda: list(DIMS))
    rows: list[MatrixRow] = Field(default_factory=list)


def _na() -> MatrixCell:
    return MatrixCell(status="NOT_APPLICABLE")


def _from_verdict(status: str, evidence: str, algorithm_id: str) -> MatrixCell:
    if status not in {"PASS", "FAIL", "UNKNOWN"}:
        status = "UNKNOWN"
    return MatrixCell(status=status, evidence=evidence, algorithm_id=algorithm_id)


def build_matrix(
    spec: WorkflowSpec,
    static: VerificationResult,
    runtime: ConformanceResult | None = None,
) -> VerificationMatrix:
    fail_by = {item.constraint_id: item for item in static.issues if item.constraint_id}
    verdict_by = {item.constraint_id: item for item in static.constraints}
    runtime_by = {}
    if runtime:
        runtime_by = {item.constraint_id: item for item in runtime.issues}
    rows: list[MatrixRow] = []

    def row(cid: str, req: str, ctype: str, mapping: dict[str, str]) -> MatrixRow:
        cells = {dim: _na() for dim in DIMS}
        verdict = verdict_by.get(cid)
        runtime_hit = runtime_by.get(cid)
        issue = fail_by.get(cid)
        for dim, algo in mapping.items():
            if dim == "runtime":
                if runtime_hit:
                    cells[dim] = _from_verdict(runtime_hit.status, runtime_hit.observed, algo)
                elif ctype in {"TEMPORAL"}:
                    cells[dim] = MatrixCell(status="UNKNOWN", evidence="runtime not run", algorithm_id=algo)
                continue
            if verdict:
                cells[dim] = _from_verdict(
                    verdict.status,
                    verdict.actual or verdict.description,
                    algo,
                )
            elif issue:
                cells[dim] = _from_verdict("FAIL", issue.actual or issue.code, algo)
        ev = next((cells[d] for d in ("structural", "semantic", "dataflow", "safety", "runtime") if cells[d].status == "FAIL"), None)
        if ev:
            cells["evidence"] = MatrixCell(status="FAIL", evidence=ev.evidence, algorithm_id=ev.algorithm_id)
        elif any(cells[d].status == "UNKNOWN" for d in DIMS if d != "evidence"):
            cells["evidence"] = MatrixCell(status="UNKNOWN", evidence="see UNKNOWN cells")
        else:
            cells["evidence"] = MatrixCell(status="PASS", evidence="constraint discharged")
        return MatrixRow(constraint_id=cid, requirement=req, constraint_type=ctype, cells=cells)

    for item in spec.required_actions:
        rows.append(row(item.id, item.requirement or item.kind, "CARDINALITY", {"semantic": "semantic.constraint", "structural": "graph.integrity"}))
    for item in spec.ordering_constraints:
        rows.append(row(item.id, item.requirement, "ORDERING", {"semantic": "semantic.constraint", "structural": "graph.reachability"}))
    for item in spec.data_dependencies:
        rows.append(row(item.id, item.requirement, "DATA_DEPENDENCY", {"dataflow": "dataflow.slice"}))
    for item in spec.safety_policies:
        rows.append(row(item.id, item.requirement or item.kind, "SAFETY_POLICY", {"safety": "safety.policy"}))
    for item in spec.temporal_constraints:
        rows.append(row(item.id, item.requirement or item.kind, "TEMPORAL", {"runtime": "runtime.temporal"}))
    return VerificationMatrix(rows=rows)
