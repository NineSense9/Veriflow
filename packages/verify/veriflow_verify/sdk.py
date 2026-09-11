"""Thin adapters over existing verifiers. Does not replace verify_workflow."""

from __future__ import annotations

from typing import Any, Protocol

from veriflow_ir.graph import shortest_path
from veriflow_ir.workflow import WorkflowIR
from veriflow_spec.models import WorkflowSpec
from veriflow_staticcheck.check import check_workflow
from veriflow_verify.algorithms import ALGORITHMS, AlgorithmSpec, get_algorithm
from veriflow_verify.safety import safety_issues
from veriflow_verify.semantic import semantic_issues


class AlgorithmAdapter(Protocol):
    def metadata(self) -> AlgorithmSpec: ...
    def validate_input(self, payload: dict) -> list[str]: ...
    def execute(self, payload: dict) -> dict: ...
    def produce_evidence(self, payload: dict, result: dict) -> list[str]: ...
    def health_check(self) -> dict: ...


class _Base:
    algorithm_id: str = ""

    def metadata(self) -> AlgorithmSpec:
        spec = get_algorithm(self.algorithm_id)
        if spec is None:
            raise KeyError(self.algorithm_id)
        return spec

    def health_check(self) -> dict:
        spec = self.metadata()
        return {"ok": True, "algorithm_id": spec.algorithm_id, "version": spec.version, "deterministic": spec.deterministic}

    def validate_input(self, payload: dict) -> list[str]:
        errors: list[str] = []
        if "ir" not in payload:
            errors.append("ir required")
        return errors

    def produce_evidence(self, payload: dict, result: dict) -> list[str]:
        return list(result.get("codes") or [])


class GraphIntegrity(_Base):
    algorithm_id = "graph.integrity"

    def execute(self, payload: dict) -> dict:
        ir: WorkflowIR = payload["ir"]
        errors = check_workflow(ir)
        return {"codes": [item.code for item in errors], "count": len(errors)}


class GraphReachability(_Base):
    algorithm_id = "graph.reachability"

    def validate_input(self, payload: dict) -> list[str]:
        errors = super().validate_input(payload)
        if not payload.get("source") or not payload.get("target"):
            errors.append("source and target required")
        return errors

    def execute(self, payload: dict) -> dict:
        ir: WorkflowIR = payload["ir"]
        path = shortest_path(ir, payload["source"], payload["target"])
        return {"reachable": path is not None, "path": path or [], "codes": []}


class SemanticConstraint(_Base):
    algorithm_id = "semantic.constraint"

    def validate_input(self, payload: dict) -> list[str]:
        errors = super().validate_input(payload)
        if "spec" not in payload:
            errors.append("spec required")
        return errors

    def execute(self, payload: dict) -> dict:
        ir: WorkflowIR = payload["ir"]
        spec: WorkflowSpec = payload["spec"]
        issues = semantic_issues(ir, spec)
        return {"codes": [item.code for item in issues], "count": len(issues)}


class SafetyPolicy(_Base):
    algorithm_id = "safety.policy"

    def validate_input(self, payload: dict) -> list[str]:
        errors = super().validate_input(payload)
        if "spec" not in payload:
            errors.append("spec required")
        return errors

    def execute(self, payload: dict) -> dict:
        ir: WorkflowIR = payload["ir"]
        spec: WorkflowSpec = payload["spec"]
        issues = safety_issues(ir, spec)
        return {"codes": [item.code for item in issues], "count": len(issues)}


class RuntimeTemporal(_Base):
    algorithm_id = "runtime.temporal"

    def validate_input(self, payload: dict) -> list[str]:
        errors = super().validate_input(payload)
        if "spec" not in payload:
            errors.append("spec required")
        return errors

    def execute(self, payload: dict) -> dict:
        from veriflow_runtime.mock_exec import mock_execute
        from veriflow_runtime.monitor import monitor_trace

        trace = mock_execute(payload["ir"], skip_after=payload.get("skip_after"))
        result = monitor_trace(trace, payload["spec"])
        return {"status": result.status, "codes": [i.constraint_id for i in result.issues if i.status == "FAIL"]}


class RuntimeAlignment(_Base):
    algorithm_id = "runtime.alignment"

    def validate_input(self, payload: dict) -> list[str]:
        errors = super().validate_input(payload)
        if "spec" not in payload:
            errors.append("spec required")
        return errors

    def execute(self, payload: dict) -> dict:
        from veriflow_runtime.align import align_trace
        from veriflow_runtime.mock_exec import mock_execute

        trace = mock_execute(payload["ir"], skip_after=payload.get("skip_after"))
        result = align_trace(payload["ir"], payload["spec"], trace)
        return {"cost": result.alignment_cost, "deviations": result.deviation_count, "codes": []}


class RepairGuard(_Base):
    algorithm_id = "repair.guard"

    def execute(self, payload: dict) -> dict:
        from veriflow_repair.guard import validate_patches

        ok, reason = validate_patches(payload["ir"], payload.get("patches") or [])
        return {"ok": ok, "reason": reason, "codes": [] if ok else ["INVALID_PATCH"]}


class RepairSelection(_Base):
    algorithm_id = "repair.selection"

    def validate_input(self, payload: dict) -> list[str]:
        errors = super().validate_input(payload)
        if "spec" not in payload:
            errors.append("spec required")
        return errors

    def execute(self, payload: dict) -> dict:
        from veriflow_repair.loop import verify_repair_loop

        report = verify_repair_loop(payload["ir"], payload["spec"], max_iterations=3)
        return {"status": report.final.status, "mode": report.repair_mode, "ops": report.patch_operations, "codes": [i.code for i in report.final.issues]}


ADAPTERS: dict[str, _Base] = {
    "graph.integrity": GraphIntegrity(),
    "graph.reachability": GraphReachability(),
    "semantic.constraint": SemanticConstraint(),
    "safety.policy": SafetyPolicy(),
    "runtime.temporal": RuntimeTemporal(),
    "runtime.alignment": RuntimeAlignment(),
    "repair.guard": RepairGuard(),
    "repair.selection": RepairSelection(),
}


def run_algorithm(algorithm_id: str, payload: dict[str, Any]) -> dict:
    adapter = ADAPTERS.get(algorithm_id)
    if adapter is None:
        raise KeyError(algorithm_id)
    errors = adapter.validate_input(payload)
    if errors:
        return {"ok": False, "errors": errors}
    result = adapter.execute(payload)
    return {
        "ok": True,
        "algorithm_id": algorithm_id,
        "version": adapter.metadata().version,
        "result": result,
        "evidence": adapter.produce_evidence(payload, result),
        "health": adapter.health_check(),
    }


def registered_executable() -> list[str]:
    return sorted(ADAPTERS) + sorted(set(ALGORITHMS) - set(ADAPTERS))
