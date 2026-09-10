from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from veriflow_ir.graph import paths_to
from veriflow_ir.workflow import WorkflowIR
from veriflow_spec.compiler import compile_spec
from veriflow_spec.models import WorkflowSpec
from veriflow_staticcheck.check import check_workflow
from veriflow_verify.issue import Issue, Risk, Status, issue_from_check_error
from veriflow_verify.safety import safety_issues
from veriflow_verify.semantic import semantic_issues

_SEV = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}


class DimensionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    status: Status
    issue_count: int


class VerificationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Status
    risk_level: Risk
    confidence: float
    issues: list[Issue] = Field(default_factory=list)
    dimensions: list[DimensionResult] = Field(default_factory=list)
    requirements_passed: int = 0
    requirements_total: int = 0
    issues_by_severity: dict[str, int] = Field(default_factory=dict)
    score_compat: dict[str, float] = Field(default_factory=dict)


def verify_workflow(ir: WorkflowIR, spec: WorkflowSpec | None = None) -> VerificationResult:
    spec = spec or compile_spec("", ir.domain)
    structural = [
        issue_from_check_error(error, index)
        for index, error in enumerate(check_workflow(ir))
    ]
    for issue in structural:
        if issue.code == "MISSING_HUMAN_GATE" and issue.affected_nodes:
            found = paths_to(ir, issue.affected_nodes[0])
            if found:
                issue.witness_path = found[0]
                issue.expected = "human_gate → publish_problem"
                issue.actual = " → ".join(found[0])
    semantic = semantic_issues(ir, spec)
    safety = safety_issues(ir, spec)
    # dataflow / executable already tagged in structural conversion
    issues = _dedupe([*structural, *semantic, *safety])
    by_cat: dict[str, list[Issue]] = {
        "structural": [],
        "semantic": [],
        "dataflow": [],
        "executable": [],
        "safety": [],
    }
    for issue in issues:
        by_cat[issue.category].append(issue)
    dimensions = [
        DimensionResult(
            name=name,
            status=_status(items),
            issue_count=len(items),
        )
        for name, items in by_cat.items()
    ]
    req_total = len(spec.required_actions) + len(spec.ordering_constraints)
    req_fail = sum(
        1
        for issue in issues
        if issue.code in {"MISSING_REQUIRED_ACTION", "CARDINALITY_VIOLATION", "ORDER_VIOLATION"}
    )
    sev_counts = {key: 0 for key in _SEV}
    for issue in issues:
        sev_counts[issue.severity] += 1
    structural_fail = any(item.category == "structural" for item in issues)
    semantic_fail = any(item.category == "semantic" for item in issues)
    exec_fail = any(item.category == "executable" for item in issues)
    return VerificationResult(
        status=_status(issues),
        risk_level=_risk(issues),
        confidence=min((issue.confidence for issue in issues), default=1.0) if issues else spec.confidence,
        issues=issues,
        dimensions=dimensions,
        requirements_passed=max(req_total - req_fail, 0),
        requirements_total=req_total,
        issues_by_severity=sev_counts,
        score_compat={
            "S": 0.0 if structural_fail else 1.0,
            "M": 0.0 if semantic_fail else 1.0,
            "E": 0.0 if exec_fail else 1.0,
        },
    )


def quality(result: VerificationResult) -> int:
    penalty = sum(_SEV[issue.severity] for issue in result.issues)
    bonus = 10 if result.status == "PASS" else 0
    return bonus - penalty


def _status(issues: list[Issue]) -> Status:
    if not issues:
        return "PASS"
    if any(issue.severity in {"HIGH", "CRITICAL"} for issue in issues):
        return "FAIL"
    return "WARNING"


def _risk(issues: list[Issue]) -> Risk:
    if any(issue.severity == "CRITICAL" for issue in issues):
        return "CRITICAL"
    if any(issue.severity == "HIGH" for issue in issues):
        return "HIGH"
    if any(issue.severity == "MEDIUM" for issue in issues):
        return "MEDIUM"
    return "LOW"


def _dedupe(issues: list[Issue]) -> list[Issue]:
    seen: set[tuple[str, str]] = set()
    out: list[Issue] = []
    for issue in issues:
        key = (issue.code, ",".join(issue.affected_nodes))
        if key in seen:
            continue
        seen.add(key)
        out.append(issue)
    return out
