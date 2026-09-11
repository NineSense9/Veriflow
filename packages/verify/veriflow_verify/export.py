from __future__ import annotations

import json
from datetime import datetime, timezone

from veriflow_verify.pipeline import VerificationSession


def _redact(text: str) -> str:
    lowered = text.lower()
    if any(key in lowered for key in ("sk-", "api_key", "password", "secret", "token")):
        return "[redacted]"
    return text


def export_markdown(session: VerificationSession) -> str:
    lines = [
        "# VeriFlow Evidence Report",
        "",
        f"- generated: {datetime.now(timezone.utc).isoformat()}",
        f"- workflow: `{session.ir.get('name')}`",
        f"- hash: `{session.workflow_hash}`",
        f"- verdict: **{session.status}**",
        f"- gate: **{session.gate.ready}**",
        f"- runtime: {session.runtime.status}",
        f"- latency_ms: {session.latency_ms}",
        f"- compiler: {session.spec.get('compiler')} / {session.spec.get('compiler_basis')}",
        "",
        "## Requirement",
        "",
        (session.spec.get("source_nl") or "(empty)")[:2000],
        "",
        "## Issues",
        "",
    ]
    if not session.static.issues:
        lines.append("(no static issues)")
    for issue in session.static.issues:
        lines.extend(
            [
                f"### {issue.code} ({issue.severity})",
                f"- detected_by: `{issue.detected_by}` v{issue.algorithm_version}",
                f"- method: {issue.verification_method}",
                f"- expected: {_redact(issue.expected or '')}",
                f"- actual: {_redact(issue.actual or '')}",
                f"- witness: {' → '.join(issue.witness_path) or '—'}",
                "",
            ]
        )
    lines.extend(["## Runtime FAIL", ""])
    fails = [item for item in session.runtime.issues if item.status == "FAIL"]
    if not fails:
        lines.append("(none)")
    for item in fails:
        lines.append(f"- `{item.constraint_id}`: {item.observed}")
    lines.extend(["", "## Alignment", f"- cost {session.alignment.alignment_cost}", ""])
    lines.extend(["", "Secrets are redacted. This pack is not a formal proof."])
    return "\n".join(lines) + "\n"


def export_json(session: VerificationSession) -> dict:
    payload = json.loads(session.model_dump_json())
    return {
        "kind": "veriflow_evidence_report",
        "not_a_formal_proof": True,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "workflow_hash": session.workflow_hash,
        "status": session.status,
        "gate": session.gate.ready,
        "spec_compiler": session.spec.get("compiler"),
        "issues": [
            {
                "code": issue.code,
                "detected_by": issue.detected_by,
                "witness": issue.witness_path,
            }
            for issue in session.static.issues
        ],
        "runtime_fails": [item.constraint_id for item in session.runtime.issues if item.status == "FAIL"],
        "graph": payload.get("graph"),
        "reproducibility": {
            "algorithm_versions": sorted({issue.detected_by for issue in session.static.issues if issue.detected_by}),
            "latency_ms": session.latency_ms,
        },
    }
