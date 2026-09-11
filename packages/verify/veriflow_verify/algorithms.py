"""Algorithm registry used by verifiers and the Algorithm Center API. Not UI-only metadata."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Kind = Literal["deterministic", "ai_assisted"]


class AlgorithmSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    algorithm_id: str
    name: str
    version: str
    category: str
    description: str
    deterministic: bool
    kind: Kind
    inputs: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)
    supported_constraints: list[str] = Field(default_factory=list)
    complexity: str = ""
    code_location: str
    steps: list[str] = Field(default_factory=list)
    used_by: list[str] = Field(default_factory=list)
    tests: list[str] = Field(default_factory=list)
    benchmark_metrics: dict[str, Any] = Field(default_factory=dict)
    limitations: str = ""
    example: str = ""


def _a(**kwargs) -> AlgorithmSpec:
    return AlgorithmSpec.model_validate(kwargs)


ALGORITHMS: dict[str, AlgorithmSpec] = {
    spec.algorithm_id: spec
    for spec in [
        _a(
            algorithm_id="graph.integrity",
            name="Graph integrity",
            version="1.0",
            category="Graph",
            description="Whitelist, on_fail, guard AST, dead nodes.",
            deterministic=True,
            kind="deterministic",
            inputs=["WorkflowIR"],
            outputs=["CheckError[]"],
            supported_constraints=["structural"],
            complexity="O(V+E) plus guard parse",
            code_location="packages/staticcheck/veriflow_staticcheck/check.py",
            steps=["Walk nodes", "Apply structural rules", "Emit CheckError"],
            used_by=["verify_workflow", "gate"],
            tests=["tests/test_staticcheck.py"],
            limitations="Compose-domain whitelist; not a general n8n node catalog.",
        ),
        _a(
            algorithm_id="graph.reachability",
            name="Reachability / witness path",
            version="1.1",
            category="Graph",
            description="BFS shortest path and bounded DFS paths_to for ordering and missing-gate witnesses.",
            deterministic=True,
            kind="deterministic",
            inputs=["WorkflowIR", "source", "goal"],
            outputs=["path | null"],
            supported_constraints=["ORDERING", "MISSING_HUMAN_GATE"],
            complexity="BFS O(V+E); mandatory-checkpoint avoidance O(V+E)",
            code_location="packages/ir/veriflow_ir/graph.py",
            steps=["Sources by indegree 0", "BFS / bounded DFS", "Return path"],
            used_by=["semantic.constraint", "counterexample.minimize"],
            tests=["tests/test_workflow_ir.py", "tests/test_verify_repair.py"],
            example="gen → pub is reachable without human_gate → witness.",
            limitations="Does not enumerate all paths on dense DAGs.",
        ),
        _a(
            algorithm_id="spec.compile",
            name="Heuristic spec compiler",
            version="1.0",
            category="Specification",
            description="NL keywords to WorkflowSpec. Default path does not call an LLM.",
            deterministic=True,
            kind="deterministic",
            inputs=["natural language", "domain"],
            outputs=["WorkflowSpec"],
            code_location="packages/spec/veriflow_spec/compiler.py",
            used_by=["CLI spec", "verify"],
            tests=["tests/test_spec.py"],
            limitations="Heuristic templates. LLM IR generation is a separate optional compiler.",
            complexity="O(|nl|)",
        ),
        _a(
            algorithm_id="semantic.constraint",
            name="Semantic constraint check",
            version="1.0",
            category="Specification",
            description="Required actions, ordering, data dependencies against the IR.",
            deterministic=True,
            kind="deterministic",
            inputs=["WorkflowIR", "WorkflowSpec"],
            outputs=["Issue[]"],
            supported_constraints=["CARDINALITY", "ORDERING", "DATA_DEPENDENCY"],
            complexity="O(|C|·(V+E))",
            code_location="packages/verify/veriflow_verify/semantic.py",
            used_by=["verify_workflow"],
            tests=["tests/test_verify_repair.py"],
            limitations="Selectors match id/kind/tool; no full first-order logic.",
        ),
        _a(
            algorithm_id="dataflow.slice",
            name="Type / producer-consumer dataflow",
            version="1.0",
            category="Dataflow",
            description="Edge in_type/out_type mismatch plus spec producer→consumer reachability.",
            deterministic=True,
            kind="deterministic",
            inputs=["WorkflowIR", "data_dependencies"],
            outputs=["TYPE_MISMATCH", "BROKEN_BINDING"],
            complexity="O(E) types + O(|D|·(V+E)) deps",
            code_location="packages/staticcheck/veriflow_staticcheck/check.py + semantic._data_deps",
            used_by=["verify_workflow"],
            tests=["tests/test_hardening.py"],
            limitations="Not a taint graph. No field-level slicing.",
        ),
        _a(
            algorithm_id="safety.policy",
            name="Safety policy heuristics",
            version="1.0",
            category="Safety",
            description="Human gate, bounds, hardcoded secrets, unrestricted webhook keys.",
            deterministic=True,
            kind="deterministic",
            inputs=["WorkflowIR", "safety_policies"],
            outputs=["HARDCODED_SECRET", "WEAK_BOUNDS", "MISSING_HUMAN_GATE"],
            complexity="O(V·|config|)",
            code_location="packages/verify/veriflow_verify/safety.py",
            used_by=["verify_workflow", "gate"],
            tests=["tests/test_hardening.py"],
            limitations="Risk detection, not a proof. Not full taint to EXTERNAL_SINK.",
        ),
        _a(
            algorithm_id="runtime.temporal",
            name="Temporal monitor",
            version="1.0",
            category="Runtime",
            description="Deterministic one-pass monitor for a temporal subset (not LTL).",
            deterministic=True,
            kind="deterministic",
            inputs=["ExecutionTrace", "TemporalConstraint[]"],
            outputs=["ConformanceResult"],
            supported_constraints=["BEFORE", "EVENTUALLY", "EXACTLY_ONCE", "IF_EXECUTED_THEN", "IF_BRANCH_THEN", "DATA_FROM"],
            complexity="O(|events|·|constraints|)",
            code_location="packages/runtime/veriflow_runtime/monitor.py",
            used_by=["gate", "runtime CLI"],
            tests=["tests/test_runtime.py"],
            limitations="Mock traces unless n8n env is set. UNKNOWN when a branch is not observed.",
        ),
        _a(
            algorithm_id="runtime.alignment",
            name="Partial-order trace alignment",
            version="1.0",
            category="Runtime",
            description="Align expected poset vs observed sequence with DP edit distance plus happens-before.",
            deterministic=True,
            kind="deterministic",
            inputs=["WorkflowIR", "WorkflowSpec", "ExecutionTrace"],
            outputs=["alignment", "alignment_cost", "deviation_count"],
            complexity="O(V^2) reachability + O(n·m) DP",
            code_location="packages/runtime/veriflow_runtime/align.py",
            steps=[
                "Build happens-before from IR edges and spec BEFORE constraints",
                "Kahn linear extension biased by observed order",
                "Needleman–Wunsch / edit DP on expected vs observed ids",
                "Relabel HB violations as OUT_OF_ORDER; incomparable pairs stay MATCH",
            ],
            used_by=["report console", "runtime CLI"],
            tests=["tests/test_refinement.py"],
            limitations="Not Petri-net process mining. One linear extension for display. Approximate concurrent matching.",
            example="Expected Schedule HTTP IF Email vs Observed Schedule HTTP Email → IF MISSING_EXPECTED.",
        ),
        _a(
            algorithm_id="incremental.impact",
            name="Impact-set incremental verify",
            version="1.0",
            category="Testing",
            description="Diff IR, compute downstream impact, re-run affected verifiers; topology falls back to full.",
            deterministic=True,
            kind="deterministic",
            inputs=["old IR", "new IR", "previous VerificationResult"],
            outputs=["IncrementalResult", "equivalence_report"],
            complexity="O(V+E) diff/impact + subset of full verify",
            code_location="packages/verify/veriflow_verify/incremental.py",
            used_by=["repair.select", "CLI incremental"],
            tests=["tests/test_runtime.py"],
            limitations="Node add/remove uses full verification on purpose.",
        ),
        _a(
            algorithm_id="repair.guard",
            name="Patch guard",
            version="1.0",
            category="Repair",
            description="Pre/post conditions on Patch DSL. Illegal patches never apply.",
            deterministic=True,
            kind="deterministic",
            inputs=["WorkflowIR", "Patch[]"],
            outputs=["ok | reason"],
            code_location="packages/repair/veriflow_repair/guard.py",
            used_by=["repair.select"],
            tests=["tests/test_hardening.py"],
            complexity="O(|patches|)",
            limitations="Guards structural preconditions, not semantic optimality.",
        ),
        _a(
            algorithm_id="repair.selection",
            name="Lexicographic candidate selection",
            version="1.0",
            category="Repair",
            description="K≤3 plans, incremental screen, full verify, lex key, rollback on regression.",
            deterministic=True,
            kind="deterministic",
            inputs=["IR", "issues", "spec"],
            outputs=["selected patch | reject reason"],
            complexity="O(K · verify)",
            code_location="packages/repair/veriflow_repair/select.py",
            used_by=["verify_repair_loop"],
            tests=["tests/test_verify_repair.py"],
            limitations="Planner is rule-based. Optional LLM compile is a different path.",
        ),
        _a(
            algorithm_id="counterexample.minimize",
            name="Minimized counterexample",
            version="1.0",
            category="Testing",
            description="Witness-path + affected-node slice. Approximate, not globally minimal.",
            deterministic=True,
            kind="deterministic",
            inputs=["WorkflowIR", "Issue"],
            outputs=["MinimizedCounterexample"],
            complexity="O(V+E) slice",
            code_location="packages/explain/veriflow_explain/minimize.py",
            used_by=["report", "bench"],
            tests=["tests/test_refinement.py"],
            limitations="Does not claim mathematical minimality. Delta-debugging is one pass of drop-non-witness nodes.",
        ),
        _a(
            algorithm_id="mutation.inject",
            name="Ground-truth IR mutation",
            version="1.0",
            category="Testing",
            description="Inject labeled faults. Mutants that do not change IR are rejected.",
            deterministic=True,
            kind="deterministic",
            inputs=["gold IR", "fault id"],
            outputs=["MutatedWorkflow"],
            code_location="packages/mutate/veriflow_mutate/ir_faults.py",
            used_by=["veriflow bench"],
            tests=["tests/test_hardening.py", "tests/test_bench.py"],
            limitations="In-repo gold IR only. Not an external leaderboard.",
        ),
        _a(
            algorithm_id="nl.ir_compile",
            name="NL → IR compiler",
            version="1.0",
            category="Specification",
            description="Optional DeepSeek JSON compile with keyword fallback. Not used for pass/fail.",
            deterministic=False,
            kind="ai_assisted",
            inputs=["natural language"],
            outputs=["WorkflowIR"],
            code_location="services/api/veriflow_api/compiler.py",
            used_by=["POST /api/compose"],
            tests=["tests/test_compose_api.py"],
            limitations="Fallback examples when no API key. Verification remains deterministic.",
        ),
    ]
}


def get_algorithm(algorithm_id: str) -> AlgorithmSpec | None:
    return ALGORITHMS.get(algorithm_id)


def list_algorithms() -> list[AlgorithmSpec]:
    return list(ALGORITHMS.values())


def attach_benchmarks(metrics: dict[str, Any] | None) -> None:
    if not metrics:
        return
    mut = ALGORITHMS["mutation.inject"]
    mut.benchmark_metrics = {
        "detection_f1": metrics.get("detection_f1"),
        "fault_localization_accuracy": metrics.get("fault_localization_accuracy"),
        "n": metrics.get("n"),
        "note": metrics.get("note"),
    }
    ALGORITHMS["repair.selection"].benchmark_metrics = {
        "repair_success_rate": metrics.get("repair_success_rate"),
        "repair_regression_rate": metrics.get("repair_regression_rate"),
    }
    if "witness_reduction_ratio" in metrics:
        ALGORITHMS["counterexample.minimize"].benchmark_metrics = {
            "witness_reduction_ratio": metrics.get("witness_reduction_ratio"),
            "average_original_affected_nodes": metrics.get("average_original_affected_nodes"),
            "average_minimized_witness_nodes": metrics.get("average_minimized_witness_nodes"),
        }


def load_smoke_metrics() -> dict[str, Any] | None:
    path = Path("experiments/runs/smoke/metrics.json")
    if not path.exists():
        return None
    import json

    return json.loads(path.read_text(encoding="utf-8"))
