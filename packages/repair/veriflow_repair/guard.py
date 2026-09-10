from __future__ import annotations

from veriflow_ir.workflow import WorkflowIR
from veriflow_repair.executor import apply_patches
from veriflow_repair.patch import Patch
from veriflow_staticcheck.whitelist import DOMAIN_TOOLS


def validate_patches(ir: WorkflowIR, patches: list[Patch]) -> tuple[bool, str]:
    if not patches:
        return False, "empty patch list"
    allowed = DOMAIN_TOOLS[ir.domain]
    for patch in patches:
        if patch.operation == "add_node" and patch.kind == "tool":
            tool = patch.tool or (patch.node or {}).get("tool")
            if tool and tool not in allowed:
                return False, f"tool {tool} not in whitelist"
        if patch.operation == "replace_node_operation" and patch.tool and patch.tool not in allowed:
            return False, f"tool {patch.tool} not in whitelist"
    try:
        apply_patches(ir, patches)
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)
    return True, "ok"
