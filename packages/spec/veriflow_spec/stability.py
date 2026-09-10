from __future__ import annotations

from veriflow_spec.compiler import compile_spec
from veriflow_spec.models import WorkflowSpec


def paraphrase_compose(nl: str) -> list[str]:
    base = nl.strip()
    return [
        base,
        base.replace("完整出题", "出一题完整流程").replace("审题门", "人工审题"),
        "生成器、范围守卫、审题、入库都要有。",
    ]


def normalize_spec(spec: WorkflowSpec) -> dict[str, set[str]]:
    return {
        "actions": {item.tool or item.kind for item in spec.required_actions},
        "ordering": {f"{item.before}->{item.after}" for item in spec.ordering_constraints},
        "deps": {f"{item.producer}->{item.consumer}" for item in spec.data_dependencies},
        "policies": {item.kind for item in spec.safety_policies},
    }


def agreement(left: WorkflowSpec, right: WorkflowSpec) -> dict[str, float]:
    a = normalize_spec(left)
    b = normalize_spec(right)

    def jaccard(x: set[str], y: set[str]) -> float:
        if not x and not y:
            return 1.0
        return len(x & y) / len(x | y)

    return {
        "entity_agreement": jaccard(a["actions"], b["actions"]),
        "ordering_agreement": jaccard(a["ordering"], b["ordering"]),
        "dependency_agreement": jaccard(a["deps"], b["deps"]),
        "constraint_type_agreement": jaccard(a["policies"], b["policies"]),
        "constraint_agreement": (
            jaccard(a["actions"], b["actions"])
            + jaccard(a["ordering"], b["ordering"])
            + jaccard(a["deps"], b["deps"])
            + jaccard(a["policies"], b["policies"])
        )
        / 4,
    }


def spec_stability(nl: str, domain: str = "compose") -> dict:
    variants = paraphrase_compose(nl) if domain == "compose" else [nl]
    specs = [compile_spec(text, domain) for text in variants]
    scores = [agreement(specs[0], item) for item in specs[1:]]
    means = {key: sum(item[key] for item in scores) / len(scores) for key in scores[0]} if scores else {}
    return {"variants": variants, "mean": means, "compiler": specs[0].compiler}
