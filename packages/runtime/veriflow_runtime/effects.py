from __future__ import annotations

from veriflow_ir.semantics import lookup, side_effect_for
from veriflow_ir.workflow import Node
from veriflow_runtime.models import EffectClass


def classify(node: Node) -> EffectClass:
    return side_effect_for(node)


def allowed(node: Node) -> tuple[bool, str]:
    kind = classify(node)
    if kind in {"PURE", "READ_ONLY", "CONTROL_FLOW"}:
        return True, "execute"
    if kind == "EXTERNAL_WRITE":
        return True, "MOCKED_EXTERNAL_EFFECT"
    if kind == "DESTRUCTIVE":
        return False, "blocked"
    sem = lookup(node)
    if sem.support == "unknown":
        return False, "blocked"
    return False, "blocked"
