from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from veriflow_explain.minimize import MinimizedCounterexample, minimize_issue
from veriflow_ir.semantics import coverage_for_ir
from veriflow_ir.workflow import WorkflowIR
from veriflow_runtime.align import AlignmentResult, align_trace
from veriflow_runtime.cross import CrossVerificationResult, cross_verify
from veriflow_runtime.hashing import workflow_hash
from veriflow_runtime.mock_exec import mock_execute
from veriflow_runtime.models import ConformanceResult, ExecutionTrace
from veriflow_runtime.monitor import monitor_trace
from veriflow_spec.ambiguity import AmbiguityReport, analyze_requirement
from veriflow_spec.compiler import compile_spec
from veriflow_spec.models import WorkflowSpec
from veriflow_verify.egraph import EvidenceGraph, build_graph
from veriflow_staticcheck.check import check_workflow
from veriflow_verify.algorithms import ALGORITHMS
from veriflow_verify.gate import GateResult, evaluate_gate
from veriflow_verify.matrix import VerificationMatrix, build_matrix
from veriflow_verify.result import VerificationResult, assemble_result, collect_issues
from veriflow_verify.traceability import Traceability, build_traceability
from veriflow_verify.safety import safety_issues
from veriflow_verify.semantic import semantic_issues


class PipelineStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    status: str
    latency_ms: float = 0.0
    algorithm_id: str = ""
    kind: str = "deterministic"
    checks_executed: int = 0
    cache_status: str = "miss"
    input_summary: str = ""
    output_summary: str = ""
    evidence: list[str] = Field(default_factory=list)


class RuntimeContext(BaseModel):
    """Inputs needed to repeat the same deterministic mock experiment."""

    model_config = ConfigDict(extra="forbid")
    engine: Literal["mock"] = "mock"
    take_true_branch: Literal[True] = True
    skip_after: str | None = None


class VerificationSession(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str
    latency_ms: float
    spec: dict
    ir: dict
    static: VerificationResult
    runtime: ConformanceResult
    trace: ExecutionTrace
    alignment: AlignmentResult
    cross: CrossVerificationResult
    gate: GateResult
    matrix: VerificationMatrix
    pipeline: list[PipelineStep] = Field(default_factory=list)
    minimized: list[MinimizedCounterexample] = Field(default_factory=list)
    node_coverage: dict = Field(default_factory=dict)
    workflow_hash: str = ""
    created_at: str = ""
    graph: EvidenceGraph | None = None
    ambiguity: AmbiguityReport | None = None
    runtime_findings: list[dict] = Field(default_factory=list)
    traceability: Traceability | None = None
    runtime_context: RuntimeContext | None = None


def _step(sid, name, status, t0, **kwargs) -> PipelineStep:
    algo = ALGORITHMS.get(kwargs.get("algorithm_id") or "")
    return PipelineStep(
        id=sid,
        name=name,
        status=status,
        latency_ms=round((time.perf_counter() - t0) * 1000, 3),
        kind=("deterministic" if not algo or algo.deterministic else "ai_assisted"),
        cache_status="miss",
        **{k: v for k, v in kwargs.items() if k in PipelineStep.model_fields},
    )


def _session_status(static_status: str, runtime_status: str) -> str:
    if static_status == "FAIL" or runtime_status == "FAIL":
        return "FAIL"
    if static_status == "UNKNOWN" or runtime_status == "UNKNOWN":
        return "UNKNOWN"
    return static_status


def run_session(
    ir: WorkflowIR,
    spec: WorkflowSpec | None = None,
    nl: str = "",
    skip_after: str | None = None,
) -> VerificationSession:
    started = time.perf_counter()
    steps: list[PipelineStep] = []
    t = time.perf_counter()
    steps.append(
        _step(
            "parse",
            "Parse",
            "PASS",
            t,
            algorithm_id="graph.integrity",
            checks_executed=1,
            input_summary=f"{len(ir.nodes)} 个节点 / {len(ir.edges)} 条连线",
            output_summary="WorkflowIR",
        )
    )
    t = time.perf_counter()
    spec = spec or compile_spec(nl, ir.domain)
    steps.append(
        _step(
            "spec",
            "Spec",
            "PASS",
            t,
            algorithm_id="spec.compile",
            checks_executed=len(spec.required_actions) + len(spec.ordering_constraints),
            input_summary=(nl or spec.source_nl)[:80],
            output_summary=f"{len(spec.temporal_constraints)} 条时序约束 + {len(spec.required_actions)} 个动作",
        )
    )
    t = time.perf_counter()
    steps.append(
        _step(
            "ir",
            "IR",
            "PASS",
            t,
            algorithm_id="graph.integrity",
            input_summary=ir.name,
            output_summary=workflow_hash(ir),
        )
    )
    t = time.perf_counter()
    struct_errors = check_workflow(ir)
    steps.append(
        _step(
            "static",
            "Static",
            "FAIL" if struct_errors else "PASS",
            t,
            algorithm_id="graph.integrity",
            checks_executed=len(struct_errors) or 7,
            output_summary=f"{len(struct_errors)} 个结构问题",
            evidence=[item.code for item in struct_errors[:8]],
        )
    )
    t = time.perf_counter()
    sem = semantic_issues(ir, spec)
    steps.append(
        _step(
            "semantic",
            "Semantic",
            "FAIL" if sem else "PASS",
            t,
            algorithm_id="semantic.constraint",
            checks_executed=len(spec.required_actions) + len(spec.ordering_constraints),
            output_summary=f"{len(sem)} 个语义问题",
            evidence=[item.code for item in sem[:8]],
        )
    )
    t = time.perf_counter()
    data_n = sum(1 for item in sem if item.category == "dataflow")
    type_n = sum(1 for item in struct_errors if item.code == "TYPE_MISMATCH")
    steps.append(
        _step(
            "dataflow",
            "Dataflow",
            "FAIL" if data_n or type_n else "PASS",
            t,
            algorithm_id="dataflow.slice",
            checks_executed=len(spec.data_dependencies) + type_n,
            output_summary=f"类型不匹配 {type_n}",
        )
    )
    t = time.perf_counter()
    safe = safety_issues(ir, spec)
    steps.append(
        _step(
            "safety",
            "Safety",
            "FAIL" if safe else "PASS",
            t,
            algorithm_id="safety.policy",
            checks_executed=len(spec.safety_policies),
            output_summary=f"{len(safe)} 个安全问题",
            evidence=[item.code for item in safe[:8]],
        )
    )
    t = time.perf_counter()
    issues, spec_issues = collect_issues(ir, spec)
    static = assemble_result(ir, spec, issues, spec_issues)
    trace = mock_execute(ir, skip_after=skip_after)
    runtime = monitor_trace(trace, spec)
    alignment = align_trace(ir, spec, trace)
    steps.append(
        _step(
            "runtime",
            "Runtime",
            runtime.status,
            t,
            algorithm_id="runtime.temporal",
            checks_executed=runtime.total,
            output_summary=f"{runtime.status} · 对齐代价 {alignment.alignment_cost}",
            evidence=[item.constraint_id for item in runtime.issues if item.status == "FAIL"][:8],
        )
    )
    steps.append(
        PipelineStep(
            id="repair",
            name="Repair",
            status="NOT_RUN",
            algorithm_id="repair.selection",
            kind="deterministic",
            cache_status="n/a",
            input_summary="执行受约束修复后显示结果",
            output_summary="",
        )
    )
    minimized = [minimize_issue(ir, issue) for issue in static.issues]
    for issue, mini in zip(static.issues, minimized):
        issue.minimized_nodes = mini.minimized_nodes
        if not issue.detected_by:
            issue.detected_by = {
                "structural": "graph.integrity",
                "semantic": "semantic.constraint",
                "dataflow": "dataflow.slice",
                "executable": "graph.reachability",
                "safety": "safety.policy",
            }.get(issue.category, "graph.integrity")
            issue.algorithm_version = (ALGORITHMS.get(issue.detected_by).version if ALGORITHMS.get(issue.detected_by) else "1.0")
            issue.evidence_source = (issue.evidence[0] if issue.evidence else issue.code)
    gate = evaluate_gate(ir, spec, static=static, runtime=runtime, run_runtime=False)
    matrix = build_matrix(spec, static, runtime)
    run_key = workflow_hash(ir)
    graph = build_graph(run_id=run_key, spec=spec, ir=ir, static=static, runtime=runtime, trace=trace)
    ambiguity = analyze_requirement(nl or spec.source_nl)
    runtime_findings = [
        {
            "id": f"rt:{item.constraint_id}",
            "code": item.constraint_id,
            "severity": "HIGH",
            "category": "runtime",
            "title": item.expected,
            "description": item.observed,
            "expected": item.expected,
            "actual": item.observed,
            "affected_nodes": item.affected_nodes,
            "witness_path": [str(i) for i in item.trace_slice],
            "detected_by": "runtime.temporal",
            "algorithm_version": "1.0",
            "verification_method": "RUNTIME",
            "repair_hint": "对照预期事件与实际观测轨迹，检查未发生的步骤",
        }
        for item in runtime.issues
        if item.status == "FAIL"
    ]
    return VerificationSession(
        status=_session_status(static.status, runtime.status),
        latency_ms=round((time.perf_counter() - started) * 1000, 3),
        spec=spec.model_dump(mode="json"),
        ir=ir.model_dump(mode="json", by_alias=True),
        static=static,
        runtime=runtime,
        trace=trace,
        alignment=alignment,
        cross=cross_verify(static, runtime),
        gate=gate,
        matrix=matrix,
        pipeline=steps,
        minimized=minimized,
        node_coverage=coverage_for_ir(ir.nodes),
        workflow_hash=workflow_hash(ir),
        created_at=datetime.now(timezone.utc).isoformat(),
        graph=graph,
        ambiguity=ambiguity,
        runtime_findings=runtime_findings,
        traceability=build_traceability(spec, ir, static, runtime_findings, ambiguity),
        runtime_context=RuntimeContext(skip_after=skip_after),
    )
