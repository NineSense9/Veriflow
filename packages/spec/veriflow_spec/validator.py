from veriflow_spec.models import WorkflowSpec


def validate_spec(spec: WorkflowSpec) -> list[str]:
    errors: list[str] = []
    if not spec.goal.strip():
        errors.append("goal is empty")
    ids = [item.id for item in spec.required_actions]
    if len(ids) != len(set(ids)):
        errors.append("duplicate required action id")
    return errors
