from __future__ import annotations

import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from veriflow_ir.workflow import WorkflowIR
from veriflow_repair.loop import RepairReport
from veriflow_runtime.hashing import spec_hash, workflow_hash
from veriflow_spec.models import WorkflowSpec
from veriflow_verify.result import VERIFIER_VERSION, VerificationResult


def _hash(payload: dict) -> str:
    blob = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()[:16]


def _git() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    except Exception:  # noqa: BLE001
        return "unknown"


def evidence_bundle(
    ir: WorkflowIR,
    spec: WorkflowSpec,
    result: VerificationResult,
    repair: RepairReport | None = None,
) -> dict:
    return {
        "kind": "veriflow_evidence_bundle",
        "not_a_formal_proof": True,
        "verifier_version": VERIFIER_VERSION,
        "git_commit": _git(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "workflow_hash": workflow_hash(ir),
        "spec_hash": spec_hash(spec),
        "result": json.loads(result.model_dump_json()),
        "repair_history": json.loads(repair.model_dump_json()) if repair else None,
    }


def write_bundle(path: Path, bundle: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
