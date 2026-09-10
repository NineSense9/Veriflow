from __future__ import annotations

from veriflow_ir.graph import match_nodes, paths_to, shortest_path
from veriflow_ir.workflow import WorkflowIR
from veriflow_spec.models import WorkflowSpec
from veriflow_verify.issue import Issue


def semantic_issues(ir: WorkflowIR, spec: WorkflowSpec) -> list[Issue]:
    issues: list[Issue] = []
    issues.extend(_actions(ir, spec))
    issues.extend(_order(ir, spec))
    issues.extend(_data_deps(ir, spec))
    return issues


def _actions(ir: WorkflowIR, spec: WorkflowSpec) -> list[Issue]:
    issues: list[Issue] = []
    for action in spec.required_actions:
        selector = action.tool or action.kind
        matched = match_nodes(ir, selector)
        count = len(matched)
        ok = True
        expected = action.cardinality
        if action.cardinality == "at_least_one" and count < 1:
            ok = False
        if action.cardinality == "exactly_one" and count != 1:
            ok = False
        if ok:
            continue
        issues.append(
            Issue(
                id=f"missing_{action.id}",
                category="semantic",
                severity="HIGH",
                code="MISSING_REQUIRED_ACTION" if count == 0 else "CARDINALITY_VIOLATION",
                title="规格动作未满足",
                description=f"{selector} 需要 {expected}，实际 {count}",
                requirement=action.requirement or selector,
                constraint_id=action.id,
                affected_nodes=[node.id for node in matched],
                expected=expected,
                actual=str(count),
                repair_hint=f"补上 {selector} 节点并接到主路径。",
                evidence=["workflowspec.required_actions"],
                verification_method="STATIC_GRAPH",
                verdict="FAIL",
            )
        )
    return issues


def _order(ir: WorkflowIR, spec: WorkflowSpec) -> list[Issue]:
    issues: list[Issue] = []
    for constraint in spec.ordering_constraints:
        befores = match_nodes(ir, constraint.before)
        afters = match_nodes(ir, constraint.after)
        if not befores or not afters:
            continue
        for after in afters:
            bad_path: list[str] | None = None
            for path in paths_to(ir, after.id):
                before_ids = {node.id for node in befores}
                if not before_ids.intersection(path):
                    bad_path = path
                    break
            if bad_path is None:
                if not any(
                    shortest_path(ir, before.id, after.id) for before in befores
                ):
                    bad_path = [after.id]
            if bad_path is None:
                continue
            issues.append(
                Issue(
                    id=f"order_{constraint.id}_{after.id}",
                    category="semantic",
                    severity="HIGH",
                    code="ORDER_VIOLATION",
                    title="顺序约束失败",
                    description=constraint.requirement
                    or f"{constraint.before} must precede {constraint.after}",
                    requirement=constraint.requirement,
                    constraint_id=constraint.id,
                    affected_nodes=[*(node.id for node in befores), after.id],
                    witness_path=bad_path,
                    expected=f"{constraint.before} → {constraint.after}",
                    actual=" → ".join(bad_path),
                    repair_hint=f"把 {constraint.after} 接到 {constraint.before} 之后。",
                    evidence=["workflowspec.ordering_constraints"],
                    verification_method="STATIC_GRAPH",
                    verdict="FAIL",
                    affected_edges=[
                        f"{bad_path[i]}->{bad_path[i + 1]}" for i in range(len(bad_path) - 1)
                    ],
                )
            )
    return issues


def _data_deps(ir: WorkflowIR, spec: WorkflowSpec) -> list[Issue]:
    issues: list[Issue] = []
    for dep in spec.data_dependencies:
        producers = match_nodes(ir, dep.producer)
        consumers = match_nodes(ir, dep.consumer)
        if not producers or not consumers:
            continue
        ok = any(
            shortest_path(ir, producer.id, consumer.id)
            for producer in producers
            for consumer in consumers
        )
        if ok:
            continue
        issues.append(
            Issue(
                id=f"dep_{dep.id}",
                category="dataflow",
                severity="HIGH",
                code="BROKEN_BINDING",
                title="数据依赖断裂",
                description=dep.requirement or f"{dep.producer} should feed {dep.consumer}",
                requirement=dep.requirement,
                constraint_id=dep.id,
                affected_nodes=[producers[0].id, consumers[0].id],
                expected=f"{dep.producer} → {dep.consumer}",
                actual="no path",
                repair_hint=f"连接 {dep.producer} 到 {dep.consumer}。",
                evidence=["workflowspec.data_dependencies"],
                verification_method="DATAFLOW",
                verdict="FAIL",
            )
        )
    return issues
