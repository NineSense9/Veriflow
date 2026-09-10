from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from veriflow_explain.rootcause import RootCauseGroup, group_issues
from veriflow_ir.graph import match_nodes, paths_to, shortest_path
from veriflow_ir.workflow import WorkflowIR
from veriflow_spec.compiler import compile_spec
from veriflow_spec.consistency import SpecIssue, check_spec
from veriflow_spec.models import WorkflowSpec
from veriflow_staticcheck.check import check_workflow
from veriflow_verify.issue import Issue, Method, Risk, Status, Verdict, issue_from_check_error
from veriflow_verify.safety import safety_issues
from veriflow_verify.semantic import semantic_issues

_SEV = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
VERIFIER_VERSION = "0.2.1"


class DimensionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    status: Status
    issue_count: int


class ConstraintVerdict(BaseModel):
    model_config = ConfigDict(extra="forbid")

    constraint_id: str
    constraint_type: str
    status: Verdict
    verification_method: Method
    description: str = ""
    expected: str | None = None
    actual: str | None = None
    evidence: list[str] = Field(default_factory=list)
    affected_nodes: list[str] = Field(default_factory=list)
    witness_path: list[str] = Field(default_factory=list)


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
    constraints: list[ConstraintVerdict] = Field(default_factory=list)
    constraints_passed: int = 0
    constraints_failed: int = 0
    constraints_unknown: int = 0
    spec_issues: list[SpecIssue] = Field(default_factory=list)
    root_causes: list[RootCauseGroup] = Field(default_factory=list)
    verifier_version: str = VERIFIER_VERSION


def verify_workflow(ir: WorkflowIR, spec: WorkflowSpec | None = None) -> VerificationResult:
    spec = spec or compile_spec("", ir.domain)
    spec_issues = check_spec(spec)
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
    issues = _dedupe([*structural, *semantic, *safety])
    roots = group_issues(issues)
    constraints = _constraint_verdicts(ir, spec, issues)
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
        DimensionResult(name=name, status=_status(items, extra_unknown=False), issue_count=len(items))
        for name, items in by_cat.items()
    ]
    passed = sum(1 for item in constraints if item.status == "PASS")
    failed = sum(1 for item in constraints if item.status == "FAIL")
    unknown = sum(1 for item in constraints if item.status == "UNKNOWN")
    sev_counts = {key: 0 for key in _SEV}
    for issue in issues:
        sev_counts[issue.severity] += 1
    structural_fail = any(item.category == "structural" for item in issues)
    semantic_fail = any(item.category == "semantic" for item in issues)
    exec_fail = any(item.category == "executable" for item in issues)
    return VerificationResult(
        status=_overall(issues, unknown, failed),
        risk_level=_risk(issues),
        confidence=min((issue.confidence for issue in issues), default=1.0) if issues else spec.confidence,
        issues=issues,
        dimensions=dimensions,
        requirements_passed=passed,
        requirements_total=len(constraints),
        issues_by_severity=sev_counts,
        score_compat={
            "S": 0.0 if structural_fail else 1.0,
            "M": 0.0 if semantic_fail else 1.0,
            "E": 0.0 if exec_fail else 1.0,
        },
        constraints=constraints,
        constraints_passed=passed,
        constraints_failed=failed,
        constraints_unknown=unknown,
        spec_issues=spec_issues,
        root_causes=roots,
    )


def quality(result: VerificationResult) -> int:
    penalty = sum(_SEV[issue.severity] for issue in result.issues)
    bonus = 10 if result.status == "PASS" else 0
    return bonus - penalty


def _constraint_verdicts(ir: WorkflowIR, spec: WorkflowSpec, issues: list[Issue]) -> list[ConstraintVerdict]:
    fail_by_cid = {issue.constraint_id: issue for issue in issues if issue.constraint_id}
    out: list[ConstraintVerdict] = []
    for action in spec.required_actions:
        matched = match_nodes(ir, action.tool or action.kind)
        failed = fail_by_cid.get(action.id)
        out.append(
            ConstraintVerdict(
                constraint_id=action.id,
                constraint_type="CARDINALITY",
                status="FAIL" if failed or (
                    action.cardinality == "at_least_one" and not matched
                ) or (
                    action.cardinality == "exactly_one" and len(matched) != 1
                ) else "PASS",
                verification_method="STATIC_GRAPH",
                description=action.requirement,
                expected=action.cardinality,
                actual=str(len(matched)),
                affected_nodes=[node.id for node in matched],
                evidence=["required_actions"],
            )
        )
    for item in spec.ordering_constraints:
        failed = fail_by_cid.get(item.id)
        befores = match_nodes(ir, item.before)
        afters = match_nodes(ir, item.after)
        if not befores or not afters:
            out.append(
                ConstraintVerdict(
                    constraint_id=item.id,
                    constraint_type="ORDERING",
                    status="UNKNOWN" if not (befores or afters) else "FAIL",
                    verification_method="STATIC_GRAPH",
                    description=item.requirement,
                    expected=f"{item.before} → {item.after}",
                    actual="missing entity",
                    evidence=["ordering_constraints"],
                )
            )
            continue
        out.append(
            ConstraintVerdict(
                constraint_id=item.id,
                constraint_type="ORDERING",
                status="FAIL" if failed else "PASS",
                verification_method="STATIC_GRAPH",
                description=item.requirement,
                expected=f"{item.before} → {item.after}",
                actual=(failed.actual if failed else "path exists"),
                affected_nodes=[*(n.id for n in befores), *(n.id for n in afters)],
                witness_path=failed.witness_path if failed else (
                    shortest_path(ir, befores[0].id, afters[0].id) or []
                ),
                evidence=["ordering_constraints"],
            )
        )
    for item in spec.data_dependencies:
        failed = fail_by_cid.get(item.id)
        out.append(
            ConstraintVerdict(
                constraint_id=item.id,
                constraint_type="DATA_DEPENDENCY",
                status="FAIL" if failed else "PASS",
                verification_method="DATAFLOW",
                description=item.requirement,
                expected=f"{item.producer} → {item.consumer}",
                actual=failed.actual if failed else "path exists",
                evidence=["data_dependencies"],
            )
        )
    for item in spec.branch_constraints:
        out.append(
            ConstraintVerdict(
                constraint_id=item.id,
                constraint_type="BRANCH",
                status="UNKNOWN",
                verification_method="HEURISTIC",
                description=item.requirement or "branch not statically decided on compose IR",
                expected=item.then_action,
                actual="no branch interpreter",
                evidence=["unsupported: compose graphs rarely encode IF nodes"],
            )
        )
    for item in spec.safety_policies:
        related = [
            issue
            for issue in issues
            if issue.category == "safety"
            and (
                (item.kind == "require_human_gate" and issue.code == "MISSING_HUMAN_GATE")
                or (item.kind == "require_bounds_guard" and issue.code == "WEAK_BOUNDS")
                or (item.kind == "no_hardcoded_secret" and issue.code == "HARDCODED_SECRET")
                or (item.kind == "no_unrestricted_webhook" and issue.code == "UNRESTRICTED_WEBHOOK")
            )
        ]
        fail = related[0] if related else None
        out.append(
            ConstraintVerdict(
                constraint_id=item.id,
                constraint_type="SAFETY_POLICY",
                status="FAIL" if fail else "PASS",
                verification_method="POLICY",
                description=item.requirement,
                expected=item.kind,
                actual=fail.code if fail else "ok",
                affected_nodes=fail.affected_nodes if fail else [],
                evidence=["safety_policies"],
            )
        )
    return out


def _overall(issues: list[Issue], unknown: int, failed: int) -> Status:
    if failed or any(issue.severity in {"HIGH", "CRITICAL"} for issue in issues):
        return "FAIL"
    if issues:
        return "WARNING"
    if unknown:
        return "UNKNOWN"
    return "PASS"


def _status(issues: list[Issue], extra_unknown: bool) -> Status:
    if not issues:
        return "UNKNOWN" if extra_unknown else "PASS"
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
