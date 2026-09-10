from __future__ import annotations

from veriflow_spec.models import WorkflowSpec


def parse_spec_json(text: str) -> WorkflowSpec:
    return WorkflowSpec.model_validate_json(text)
