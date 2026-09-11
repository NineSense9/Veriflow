from __future__ import annotations

from veriflow_spec.models import (
    DataDependency,
    OrderingConstraint,
    RequiredAction,
    SafetyPolicy,
    TemporalConstraint,
    WorkflowSpec,
)
from veriflow_spec.spans import span


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
    temporal = _compose_temporal(text)
    traces = [
        span(text, "act_gen", "生成器", "测资", "test_generator"),
        span(text, "act_guard", "守卫", "范围", "上界"),
        span(text, "act_gate", "审题", "人工", "human"),
        span(text, "act_pub", "入库", "发布", "publish"),
        span(text, "ord_gen_guard", "生成器", "守卫"),
        span(text, "ord_guard_gate", "守卫", "审题"),
        span(text, "ord_gate_pub", "审题", "入库"),
        span(text, "tmp_if_true_then_notify", "通知", "邮件", "email", "payment"),
        span(text, "tmp_eventually_notify", "通知", "邮件"),
    ]
    return WorkflowSpec(
        domain="compose",
        goal=text.splitlines()[0][:80] if text else "compose a problem",
        source_nl=text,
        required_actions=actions,
        ordering_constraints=ordering,
        data_dependencies=deps,
        safety_policies=policies,
        temporal_constraints=temporal,
        source_traces=traces,
        compiler="heuristic",
        compiler_basis="empty" if not text else ("keyword" if any(span.kind == "nl_span" for span in traces) else "platform_template"),
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
        temporal_constraints=[
            TemporalConstraint(
                id="tmp_before_ocr_gate",
                kind="BEFORE",
                a="invoice_ocr",
                b="human_gate",
                requirement="识别必须在人工审之前执行",
            ),
            TemporalConstraint(
                id="tmp_eventually_gate",
                kind="EVENTUALLY",
                a="human_gate",
                requirement="人工审最终必须发生",
            ),
        ],
        source_traces=[
            span(text, "act_ocr", "发票", "识别", "ocr"),
            span(text, "act_gate", "人工", "审"),
        ],
        compiler="heuristic",
        compiler_basis="keyword" if text else "empty",
        evidence=["campus policy"],
    )


def _compose_temporal(text: str) -> list[TemporalConstraint]:
    constraints = [
        TemporalConstraint(
            id="tmp_before_gen_gate",
            kind="BEFORE",
            a="test_generator",
            b="human_gate",
            requirement="生成器必须在审题门之前执行",
        ),
        TemporalConstraint(
            id="tmp_eventually_pub",
            kind="EVENTUALLY",
            a="publish_problem",
            requirement="入库动作最终必须发生",
        ),
        TemporalConstraint(
            id="tmp_once_pub",
            kind="EXACTLY_ONCE",
            a="publish_problem",
            requirement="入库恰好一次",
        ),
        TemporalConstraint(
            id="tmp_if_gen_then_gate",
            kind="IF_EXECUTED_THEN",
            a="test_generator",
            b="human_gate",
            requirement="跑过生成器则必须审题",
        ),
        TemporalConstraint(
            id="tmp_data_gen_guard",
            kind="DATA_FROM",
            a="test_generator",
            b="guard",
            requirement="守卫消费的数据必须来自生成器",
        ),
    ]
    lowered = text.lower()
    if any(key in text for key in ("通知", "邮件", "email")) or "payment" in lowered:
        constraints.append(
            TemporalConstraint(
                id="tmp_if_true_then_notify",
                kind="IF_BRANCH_THEN",
                a="branch",
                b="notify",
                branch="true",
                requirement="条件为真时必须发送通知",
            )
        )
        constraints.append(
            TemporalConstraint(
                id="tmp_eventually_notify",
                kind="EVENTUALLY",
                a="notify",
                requirement="通知最终必须发生",
            )
        )
    return constraints
