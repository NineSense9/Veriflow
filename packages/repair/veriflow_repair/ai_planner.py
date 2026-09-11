from __future__ import annotations

from veriflow_ir.workflow import WorkflowIR
from veriflow_repair.candidate import RepairCandidate
from veriflow_repair.patch import Patch
from veriflow_spec.models import WorkflowSpec
from veriflow_staticcheck.whitelist import DOMAIN_TOOLS
from veriflow_verify.ai_trace import AIInvocationTrace
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


def _wrap_complete(complete_fn):
    raw = complete_fn

    def complete(messages, **kwargs):  # type: ignore[misc]
        payload = raw(messages)
        if hasattr(payload, "text"):
            return payload

        class R:
            text = payload if isinstance(payload, str) else ""
            error = None
            model = None
            latency_ms = None
            prompt_tokens = None
            completion_tokens = None
            retries = 0
            request_id = None
            fallback_reason = None

        return R()

    return complete


def propose_ai_patches(
    ir: WorkflowIR,
    spec: WorkflowSpec,
    issues: list[Issue],
    *,
    complete_fn=None,
) -> tuple[list[dict], str | None, object | None]:
    """Return (candidates, reject_reason, llm_result). Never decides PASS/FAIL."""
    if not issues:
        return [], None, None
    llm_result = None
    if complete_fn is None:
        try:
            from veriflow_api.llm import complete, parse_json_object
        except Exception:  # noqa: BLE001
            return [], "llm_unavailable", None
    else:
        parse_json_object = __import__("json").loads
        complete = _wrap_complete(complete_fn)

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
    llm_result = result
    if getattr(result, "error", None) or not getattr(result, "text", ""):
        return [], getattr(result, "fallback_reason", None) or getattr(result, "error", None) or "empty", result
    try:
        payload = parse_json_object(result.text)
    except Exception:  # noqa: BLE001
        return [], "malformed_json", result
    raw_list = payload.get("candidates") if isinstance(payload, dict) else payload
    if isinstance(payload, dict) and "patches" in payload and not raw_list:
        raw_list = [payload]
    if not isinstance(raw_list, list):
        return [], "malformed_json", result
    plans: list[dict] = []
    for item in raw_list[:MAX_AI_CANDIDATES]:
        if not isinstance(item, dict):
            return [], "invalid_candidate", result
        try:
            patches = [Patch.model_validate(p) for p in item.get("patches") or []]
        except Exception:  # noqa: BLE001
            return [], "invalid_patch_schema", result
        if not patches:
            continue
        for patch in patches:
            if patch.operation not in ALLOWED_OPS:
                return [], "invalid_operation", result
            kind = patch.kind or (patch.node or {}).get("kind")
            tool = patch.tool or (patch.node or {}).get("tool")
            if (kind == "tool" or tool) and tool and tool not in DOMAIN_TOOLS.get(ir.domain, ()):
                return [], "forbidden_tool", result
        plans.append(
            {
                "patches": patches,
                "rationale": str(item.get("rationale") or ""),
                "target_issue_id": item.get("target_issue_id") or (issues[0].id if issues else None),
            }
        )
    return plans, None, llm_result


def propose_ai_candidates(
    ir: WorkflowIR,
    spec: WorkflowSpec,
    issues: list[Issue],
    *,
    complete_fn=None,
) -> tuple[list[RepairCandidate], AIInvocationTrace]:
    plans, reason, llm = propose_ai_patches(ir, spec, issues, complete_fn=complete_fn)
    requested = True
    used = bool(plans)
    model = getattr(llm, "model", None) or None
    trace = AIInvocationTrace(
        stage="repair",
        requested=requested,
        used=used,
        provider="deepseek" if used or reason not in {None, "llm_unavailable"} else None,
        model=model,
        status="SUCCESS" if used else ("ERROR" if reason == "malformed_json" else "FALLBACK" if reason else "NOT_USED"),
        latency_ms=getattr(llm, "latency_ms", None),
        prompt_tokens=getattr(llm, "prompt_tokens", None),
        completion_tokens=getattr(llm, "completion_tokens", None),
        retries=int(getattr(llm, "retries", 0) or 0),
        request_id=getattr(llm, "request_id", None),
        fallback_reason=reason or getattr(llm, "fallback_reason", None),
        prompt_version="repair-v1",
    )
    cands = [
        RepairCandidate(
            id=f"deepseek-{index:02d}",
            source="deepseek",
            model=model,
            prompt_version="repair-v1",
            target_issue_id=item.get("target_issue_id") or (issues[0].id if issues else None),
            rationale=item.get("rationale") or "",
            patches=item["patches"],
            llm_latency_ms=getattr(llm, "latency_ms", None),
            prompt_tokens=getattr(llm, "prompt_tokens", None),
            completion_tokens=getattr(llm, "completion_tokens", None),
            fallback_reason=reason,
        )
        for index, item in enumerate(plans, start=1)
    ]
    return cands, trace

