from fastapi import FastAPI

from veriflow_ir.workflow import WorkflowIR
from veriflow_staticcheck.check import check_workflow

app = FastAPI(title="Veriflow API", version="0.1.0")


@app.get("/api/health")
def health() -> dict[str, object]:
    return {"ok": True, "sandbox": "unconfigured"}


@app.post("/api/compose/check")
def compose_check(ir: WorkflowIR) -> dict[str, object]:
    errors = check_workflow(ir)
    return {"ok": len(errors) == 0, "errors": [error.model_dump() for error in errors]}
