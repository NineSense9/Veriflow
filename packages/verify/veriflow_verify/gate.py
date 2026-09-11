from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from xml.etree.ElementTree import Element, SubElement, tostring

from pydantic import BaseModel, ConfigDict, Field

from veriflow_ir.workflow import WorkflowIR
from veriflow_runtime.cross import CrossVerificationResult, cross_verify
from veriflow_runtime.mock_exec import mock_execute
from veriflow_runtime.models import ConformanceResult
from veriflow_runtime.monitor import monitor_trace
from veriflow_spec.models import WorkflowSpec
from veriflow_verify.result import VerificationResult, verify_workflow

DEFAULT_POLICY = {
    "fail_on": {"severity": ["CRITICAL", "HIGH"]},
    "unknown_policy": {"runtime": "warning", "safety": "fail"},
    "requirements": {"minimum_coverage": 0.9},
    "repair": {"allow_auto_repair": False},
    "regression": {"allow_new_high_severity": False},
    "benchmark": {"minimum_detection_f1": None},
}


class GateResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ready: str
    exit_code: int
    static_status: str
    runtime_status: str
    reasons: list[str] = Field(default_factory=list)
    issue_count: int = 0
    high_severity: int = 0
    requirements_passed: int = 0
    requirements_total: int = 0
    runtime_coverage: float | None = None
    cross_pattern: str | None = None
    dimensions: dict[str, str] = Field(default_factory=dict)


def load_policy(path: str | None) -> dict[str, Any]:
    if not path:
        return dict(DEFAULT_POLICY)
    text = Path(path).read_text(encoding="utf-8")
    loaded = _parse_policy_text(text)
    return _merge_policy(DEFAULT_POLICY, loaded)


def _merge_policy(base: dict, extra: dict) -> dict:
    out = dict(base)
    for key, value in extra.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            merged = dict(out[key])
            merged.update(value)
            out[key] = merged
        else:
            out[key] = value
    return out


def _parse_policy_text(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if not stripped:
        return {}
    if stripped.startswith("{"):
        return json.loads(stripped)
    return _parse_simple_yaml(stripped)


def _parse_simple_yaml(text: str) -> dict[str, Any]:
    """Indent-based YAML subset: maps, nested maps, scalar lists. No tags/anchors."""
    root: dict[str, Any] = {}
    stack: list[tuple[int, Any]] = [(-1, root)]
    for raw in text.splitlines():
        if not raw.strip() or raw.strip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        line = raw.strip()
        if line.startswith("- "):
            while len(stack) > 1 and indent < stack[-1][0]:
                stack.pop()
        else:
            while len(stack) > 1 and indent <= stack[-1][0]:
                stack.pop()
        parent = stack[-1][1]
        if line.startswith("- "):
            value = _scalar(line[2:])
            if isinstance(parent, list):
                parent.append(value)
            elif isinstance(parent, dict) and not parent:
                stack.pop()
                grand = stack[-1][1]
                if isinstance(grand, dict):
                    for key, current in list(grand.items()):
                        if current is parent:
                            grand[key] = [value]
                            stack.append((indent, grand[key]))
                            break
            continue
        if ":" not in line:
            continue
        key, rest = line.split(":", 1)
        key = key.strip()
        rest = rest.strip()
        if not isinstance(parent, dict):
            continue
        if rest == "":
            parent[key] = {}
            stack.append((indent, parent[key]))
            continue
        parent[key] = _scalar(rest)
    return root


def _scalar(text: str) -> Any:
    value = text.strip().strip('"').strip("'")
    lowered = value.lower()
    if lowered in {"true", "yes"}:
        return True
    if lowered in {"false", "no"}:
        return False
    if lowered in {"null", "~", "none"}:
        return None
    try:
        if "." in value:
            return float(value)
        return int(value)
    except ValueError:
        return value


def evaluate_gate(
    ir: WorkflowIR,
    spec: WorkflowSpec,
    static: VerificationResult | None = None,
    run_runtime: bool = True,
    policy: dict | None = None,
    skip_after: str | None = None,
    runtime: ConformanceResult | None = None,
    cross: CrossVerificationResult | None = None,
) -> GateResult:
    policy = _merge_policy(DEFAULT_POLICY, policy or {})
    static = static or verify_workflow(ir, spec)
    reasons: list[str] = []
    fail_sev = set((policy.get("fail_on") or {}).get("severity") or ["CRITICAL", "HIGH"])
    high = 0
    for issue in static.issues:
        if issue.severity in fail_sev:
            reasons.append(f"{issue.severity}:{issue.code}")
        if issue.severity in {"HIGH", "CRITICAL"}:
            high += 1
    unknown_policy = policy.get("unknown_policy") or {}
    if any(issue.category == "safety" and issue.verdict == "UNKNOWN" for issue in static.issues):
        if unknown_policy.get("safety") == "fail":
            reasons.append("SAFETY_UNKNOWN")
    runtime_status = "NOT_RUN"
    coverage: float | None = None
    if runtime is None and run_runtime:
        trace = mock_execute(ir, skip_after=skip_after)
        runtime = monitor_trace(trace, spec)
        cross = cross_verify(static, runtime)
    if runtime is not None:
        runtime_status = runtime.status
        coverage = runtime.constraint_runtime_coverage
        if cross is None:
            cross = cross_verify(static, runtime)
        if runtime.status == "FAIL":
            reasons.append("RUNTIME_FAIL")
        if runtime.status == "UNKNOWN" and unknown_policy.get("runtime") == "fail":
            reasons.append("RUNTIME_UNKNOWN")
        minimum = float((policy.get("requirements") or {}).get("minimum_coverage") or 0)
        if coverage is not None and coverage < minimum:
            reasons.append(f"COVERAGE:{coverage:.3f}<{minimum}")
    dimensions = {item.name: item.status for item in static.dimensions}
    dimensions["runtime"] = runtime_status
    dimensions["unknown"] = "FAIL" if static.constraints_unknown and unknown_policy.get("runtime") == "fail" else (
        "WARNING" if static.constraints_unknown else "PASS"
    )
    dimensions["regression"] = "PASS"
    if reasons:
        ready = "BLOCKED"
        exit_code = 1
    elif static.status == "UNKNOWN" or runtime_status == "UNKNOWN":
        ready = "REVIEW REQUIRED"
        exit_code = 0
    else:
        ready = "READY"
        exit_code = 0
    return GateResult(
        ready=ready,
        exit_code=exit_code,
        static_status=static.status,
        runtime_status=runtime_status,
        reasons=reasons,
        issue_count=len(static.issues) + sum(
            1 for item in (runtime.issues if runtime else []) if item.status == "FAIL"
        ),
        high_severity=high,
        requirements_passed=static.requirements_passed,
        requirements_total=static.requirements_total,
        runtime_coverage=coverage,
        cross_pattern=cross.pattern if cross else None,
        dimensions=dimensions,
    )


def render_markdown(
    gate: GateResult,
    *,
    new_issues: int = 0,
    resolved_issues: int = 0,
    changed_nodes: int = 0,
    reevaluated: int = 0,
    patch_hint: str = "",
) -> str:
    lines = [
        "# VeriFlow Reliability Gate",
        "",
        f"Status: **{gate.ready}**",
        "",
        f"- Static: {gate.static_status}",
        f"- Runtime: {gate.runtime_status}",
        f"- Requirements: {gate.requirements_passed} / {gate.requirements_total}",
        f"- High severity: {gate.high_severity}",
        f"- Issue count: {gate.issue_count}",
        f"- New issues: {new_issues}",
        f"- Resolved issues: {resolved_issues}",
        f"- Changes: {changed_nodes} nodes affected",
        f"- Constraints re-evaluated: {reevaluated}",
    ]
    if gate.runtime_coverage is not None:
        lines.append(f"- Runtime constraint coverage: {gate.runtime_coverage:.1%}")
    if gate.cross_pattern:
        lines.append(f"- Cross: {gate.cross_pattern}")
    lines.append("")
    lines.append("## Dimensions")
    for name, status in gate.dimensions.items():
        lines.append(f"- {name}: {status}")
    if gate.reasons:
        lines.extend(["", "## Reasons", *[f"- `{item}`" for item in gate.reasons]])
    if patch_hint:
        lines.extend(["", "## Patch suggestion", patch_hint])
    lines.extend(["", "Full JSON is the CLI stdout / CI artifact, not this summary."])
    return "\n".join(lines) + "\n"


def render_junit(gate: GateResult) -> str:
    suite = Element("testsuite")
    suite.set("name", "veriflow-gate")
    cases = gate.reasons or ["READY"]
    suite.set("tests", str(len(cases)))
    failures = 0 if gate.exit_code == 0 else max(len(gate.reasons), 1)
    suite.set("failures", str(failures if gate.exit_code == 1 else 0))
    suite.set("errors", "1" if gate.exit_code == 2 else "0")
    if not gate.reasons:
        case = SubElement(suite, "testcase")
        case.set("name", gate.ready)
        case.set("classname", "veriflow.gate")
    for reason in gate.reasons:
        case = SubElement(suite, "testcase")
        case.set("name", reason)
        case.set("classname", "veriflow.gate")
        if gate.exit_code == 1:
            fail = SubElement(case, "failure")
            fail.set("message", reason)
            fail.text = gate.ready
        elif gate.exit_code == 2:
            err = SubElement(case, "error")
            err.set("message", reason)
    return tostring(suite, encoding="unicode")
