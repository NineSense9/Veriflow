from __future__ import annotations

import re

from veriflow_ir.workflow import WorkflowIR
from veriflow_spec.models import WorkflowSpec
from veriflow_verify.issue import Issue

SECRET_KEYS = {"password", "secret", "token", "api_key", "apikey", "access_key", "private_key"}
ENV_LIKE = re.compile(r"^(\$\{.*\}|\{\{.*\}\}|env:.*)$", re.I)


def safety_issues(ir: WorkflowIR, spec: WorkflowSpec) -> list[Issue]:
    issues: list[Issue] = []
    kinds = {item.kind for item in spec.safety_policies}
    if "no_hardcoded_secret" in kinds or spec.safety_policies == []:
        issues.extend(_hardcoded_secrets(ir))
    if "no_unrestricted_webhook" in kinds:
        issues.extend(_webhooks(ir))
    if "require_bounds_guard" in kinds:
        issues.extend(_bounds(ir))
    return issues


def _hardcoded_secrets(ir: WorkflowIR) -> list[Issue]:
    issues: list[Issue] = []
    for node in ir.nodes:
        for key, value in (node.config or {}).items():
            if key.lower().replace("-", "_") not in SECRET_KEYS:
                continue
            if not isinstance(value, str) or not value.strip():
                continue
            if ENV_LIKE.match(value.strip()):
                continue
            issues.append(
                Issue(
                    id=f"secret_{node.id}_{key}",
                    category="safety",
                    severity="CRITICAL",
                    code="HARDCODED_SECRET",
                    title="硬编码密钥",
                    description=f"{node.id}.config.{key} 看起来是明文密钥",
                    requirement="no_hardcoded_secret",
                    affected_nodes=[node.id],
                    expected="env / secret ref",
                    actual=key,
                    repair_hint="删掉明文密钥，改为环境变量引用。",
                    evidence=["taint: credential source in node.config"],
                    confidence=0.86,
                )
            )
    return issues


def _webhooks(ir: WorkflowIR) -> list[Issue]:
    issues: list[Issue] = []
    for node in ir.nodes:
        url = str((node.config or {}).get("url") or "")
        if not url.startswith("http"):
            continue
        if "127.0.0.1" in url or "localhost" in url:
            continue
        issues.append(
            Issue(
                id=f"webhook_{node.id}",
                category="safety",
                severity="HIGH",
                code="UNRESTRICTED_WEBHOOK",
                title="外部 URL",
                description=f"{node.id} 指向外部地址 {url}",
                requirement="no_unrestricted_webhook",
                affected_nodes=[node.id],
                expected="私网或显式白名单",
                actual=url,
                repair_hint="确认外发是有意的，或改为内网地址。",
                evidence=["potential unsafe flow: node.config.url"],
                confidence=0.7,
            )
        )
    return issues


def _bounds(ir: WorkflowIR) -> list[Issue]:
    gens = [node for node in ir.nodes if node.kind == "tool" and node.tool == "test_generator"]
    if not gens:
        return []
    guards = [node for node in ir.nodes if node.kind == "guard"]
    if not guards:
        return [
            Issue(
                id="bounds_missing",
                category="safety",
                severity="HIGH",
                code="WEAK_BOUNDS",
                title="缺少上界守卫",
                description="有生成器但没有范围守卫，测资可能从不打上界。",
                requirement="require_bounds_guard",
                affected_nodes=[gens[0].id],
                expected="guard with n_max / 100000",
                actual="no guard",
                repair_hint="在生成器之后插入 spec.n_max <= 100000 守卫。",
                evidence=["attack_compose.weak_bounds"],
            )
        ]
    issues: list[Issue] = []
    for guard in guards:
        expr = guard.expr or ""
        if "n_max" in expr or "100000" in expr or "1e5" in expr:
            continue
        issues.append(
            Issue(
                id=f"bounds_{guard.id}",
                category="safety",
                severity="MEDIUM",
                code="WEAK_BOUNDS",
                title="守卫未见上界",
                description=f"守卫 {guard.id} 没有看到上界",
                requirement="require_bounds_guard",
                affected_nodes=[guard.id],
                expected="n_max bound",
                actual=expr,
                repair_hint="在表达式中加入 spec.n_max <= 100000。",
                evidence=["attack_compose.weak_bounds"],
            )
        )
    return issues
