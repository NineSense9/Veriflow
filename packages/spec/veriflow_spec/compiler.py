from __future__ import annotations

from veriflow_spec.models import (
    DataDependency,
    OrderingConstraint,
    RequiredAction,
    SafetyPolicy,
    WorkflowSpec,
)


def compile_spec(nl: str, domain: str = "compose") -> WorkflowSpec:
    """Deterministic NL → WorkflowSpec. LLM optional later; no Key required."""
    text = (nl or "").strip()
    if domain == "campus":
        return _campus_spec(text)
    return _compose_spec(text)


def _compose_spec(text: str) -> WorkflowSpec:
    evidence = ["platform compose policy", "source_nl"]
    actions = [
        RequiredAction(
            id="act_gen",
            kind="tool",
            tool="test_generator",
            cardinality="at_least_one",
            requirement="必须有测资生成器",
        ),
        RequiredAction(
            id="act_guard",
            kind="guard",
            cardinality="at_least_one",
            requirement="必须有可解析的范围守卫",
        ),
        RequiredAction(
            id="act_gate",
            kind="human_gate",
            cardinality="at_least_one",
            requirement="发布前必须有审题门",
        ),
        RequiredAction(
            id="act_pub",
            kind="tool",
            tool="publish_problem",
            cardinality="exactly_one",
            requirement="必须恰好一次入库",
        ),
    ]
    if any(key in text for key in ("暴力", "brute", "对拍")):
        actions.append(
            RequiredAction(
                id="act_brute",
                kind="tool",
                tool="run_brute",
                cardinality="at_least_one",
                requirement="题意要求暴力解",
            )
        )
    ordering = [
        OrderingConstraint(
            id="ord_gen_guard",
            before="test_generator",
            after="guard",
            requirement="生成器之后必须经过守卫",
        ),
        OrderingConstraint(
            id="ord_guard_gate",
            before="guard",
            after="human_gate",
            requirement="守卫之后必须经过审题门",
        ),
        OrderingConstraint(
            id="ord_gate_pub",
            before="human_gate",
            after="publish_problem",
            requirement="审题门必须在入库之前",
        ),
    ]
    deps = [
        DataDependency(
            id="dep_gen_guard",
            producer="test_generator",
            consumer="guard",
            field="tests",
            requirement="生成器输出应进入守卫",
        )
    ]
    policies = [
        SafetyPolicy(
            id="pol_gate",
            kind="require_human_gate",
            requirement="平台策略：publish 前必须 human_gate",
        ),
        SafetyPolicy(
            id="pol_bounds",
            kind="require_bounds_guard",
            requirement="平台策略：有生成器必须有上界守卫",
        ),
        SafetyPolicy(
            id="pol_secret",
            kind="no_hardcoded_secret",
            requirement="节点 config 不得硬编码密钥",
        ),
        SafetyPolicy(
            id="pol_hook",
            kind="no_unrestricted_webhook",
            requirement="外发 URL 视为潜在不安全流",
        ),
    ]
    return WorkflowSpec(
        domain="compose",
        goal=text.splitlines()[0][:80] if text else "compose a problem",
        source_nl=text,
        required_actions=actions,
        ordering_constraints=ordering,
        data_dependencies=deps,
        safety_policies=policies,
        compiler="heuristic",
        confidence=0.9 if text else 0.7,
        evidence=evidence,
    )


def _campus_spec(text: str) -> WorkflowSpec:
    return WorkflowSpec(
        domain="campus",
        goal=text.splitlines()[0][:80] if text else "campus workflow",
        source_nl=text,
        required_actions=[
            RequiredAction(
                id="act_ocr",
                kind="tool",
                tool="invoice_ocr",
                cardinality="at_least_one",
                requirement="需要发票识别",
            ),
            RequiredAction(
                id="act_gate",
                kind="human_gate",
                cardinality="at_least_one",
                requirement="需要人工审",
            ),
        ],
        ordering_constraints=[
            OrderingConstraint(
                id="ord_ocr_gate",
                before="invoice_ocr",
                after="human_gate",
                requirement="识别之后才能审",
            )
        ],
        safety_policies=[
            SafetyPolicy(id="pol_secret", kind="no_hardcoded_secret"),
            SafetyPolicy(id="pol_hook", kind="no_unrestricted_webhook"),
        ],
        compiler="heuristic",
        confidence=0.85,
        evidence=["campus policy"],
    )
