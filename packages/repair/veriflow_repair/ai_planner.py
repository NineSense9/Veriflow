from __future__ import annotations

from veriflow_ir.workflow import WorkflowIR
from veriflow_repair.patch import Patch
from veriflow_spec.models import WorkflowSpec
from veriflow_staticcheck.whitelist import DOMAIN_TOOLS
from veriflow_verify.issue import Issue

MAX_AI_CANDIDATES = 2
ALLOWED_OPS = {
    "add_node",
    "remove_node",
    "update_node_parameter",
    "replace_node_operation",
    "connect_nodes",
    "disconnect_nodes",
    "update_condition",
    "update_binding",
}


def propose_ai_patches(
    ir: WorkflowIR,
    spec: WorkflowSpec,
    issues: list[Issue],
    *,
    complete_fn=None,
) -> tuple[list[list[Patch]], str | None]:
    """Return (plans, reject_reason). complete_fn is injectable; never decides PASS/FAIL."""
    if not issues:
        return [], None
    if complete_fn is None:
        try:
            from veriflow_api.llm import complete, parse_json_object
        except Exception:  # noqa: BLE001
            return [], "llm_unavailable"
    else:
        parse_json_object = __import__("json").loads

        def complete(messages, **kwargs):  # type: ignore[misc]
            class R:
                text = complete_fn(messages)
                error = None

            return R()

    issue = issues[0]
    prompt = {
        "spec_goal": spec.goal,
        "issue": {
            "id": issue.id,
            "code": issue.code,
            "expected": issue.expected,
            "actual": issue.actual,
            "witness": issue.witness_path,
        },
        "ir": ir.model_dump(mode="json", by_alias=True),
        "allowed_operations": sorted(ALLOWED_OPS),
        "allowed_tools": sorted(DOMAIN_TOOLS.get(ir.domain, ())),
        "format": {"candidates": [{"patches": [], "rationale": "", "target_issue_id": issue.id}]},
    }
    result = complete(
        [
            {
                "role": "system",
                "content": "Propose local Patch DSL JSON only. Do not decide PASS/FAIL. Max 2 candidates.",
            },
            {"role": "user", "content": __import__("json").dumps(prompt, ensure_ascii=False)},
        ],
        json_object=True,
    )
    if getattr(result, "error", None) or not getattr(result, "text", ""):
        return [], getattr(result, "fallback_reason", None) or getattr(result, "error", None) or "empty"
    try:
        payload = parse_json_object(result.text)
    except Exception:  # noqa: BLE001
        return [], "malformed_json"
    raw_list = payload.get("candidates") if isinstance(payload, dict) else payload
    if isinstance(payload, dict) and "patches" in payload and not raw_list:
        raw_list = [payload]
    if not isinstance(raw_list, list):
        return [], "malformed_json"
    plans: list[list[Patch]] = []
    for item in raw_list[:MAX_AI_CANDIDATES]:
        if not isinstance(item, dict):
            return [], "invalid_candidate"
        try:
            patches = [Patch.model_validate(p) for p in item.get("patches") or []]
        except Exception:  # noqa: BLE001
            return [], "invalid_patch_schema"
        if not patches:
            continue
        for patch in patches:
            if patch.operation not in ALLOWED_OPS:
                return [], "invalid_operation"
            kind = patch.kind or (patch.node or {}).get("kind")
            tool = patch.tool or (patch.node or {}).get("tool")
            if (kind == "tool" or tool) and tool and tool not in DOMAIN_TOOLS.get(ir.domain, ()):
                return [], "forbidden_tool"
        plans.append(patches)
    return plans, None
