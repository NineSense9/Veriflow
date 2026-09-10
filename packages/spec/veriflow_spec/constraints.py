from veriflow_spec.models import OrderingConstraint, RequiredAction, WorkflowSpec


def action_selectors(spec: WorkflowSpec) -> list[str]:
    out: list[str] = []
    for item in spec.required_actions:
        out.append(item.tool or item.kind)
    return out


def orderings(spec: WorkflowSpec) -> list[OrderingConstraint]:
    return list(spec.ordering_constraints)


def required(spec: WorkflowSpec) -> list[RequiredAction]:
    return list(spec.required_actions)
