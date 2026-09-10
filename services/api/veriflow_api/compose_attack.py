from __future__ import annotations

from veriflow_ir.workflow import WorkflowIR


def attack_compose(ir: WorkflowIR) -> list[dict]:
    findings: list[dict] = []
    guards = [node for node in ir.nodes if node.kind == "guard"]
    gens = [node for node in ir.nodes if node.kind == "tool" and node.tool == "test_generator"]
    if gens and not guards:
        findings.append(
            {
                "tag": "weak_bounds",
                "message": "有生成器但没有范围守卫，测资可能从不打 n 的上界。",
            }
        )
    for guard in guards:
        expr = guard.expr or ""
        if "n_max" not in expr and "100000" not in expr and "1e5" not in expr:
            findings.append(
                {
                    "tag": "weak_bounds",
                    "node_id": guard.id,
                    "message": f"守卫 {guard.id} 没有看到上界，攻击者可以生成永远偏小的数据。",
                }
            )
    if any(node.kind == "tool" and node.tool == "publish_problem" for node in ir.nodes):
        if not any(node.kind == "human_gate" for node in ir.nodes):
            findings.append(
                {
                    "tag": "skip_review",
                    "message": "发布前没有审题门，弱题会直接入库。",
                }
            )
    return findings
