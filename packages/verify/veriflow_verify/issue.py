from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from veriflow_staticcheck.check import CheckError

Category = Literal["structural", "semantic", "dataflow", "executable", "safety"]
Severity = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
Status = Literal["PASS", "WARNING", "FAIL", "UNKNOWN"]
Verdict = Literal["PASS", "FAIL", "UNKNOWN"]
Method = Literal["STATIC_GRAPH", "DATAFLOW", "POLICY", "HEURISTIC", "RUNTIME", "LLM_ASSISTED"]
Risk = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]


class Issue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    category: Category
    severity: Severity
    code: str
    title: str
    description: str
    requirement: str | None = None
    constraint_id: str | None = None
    affected_nodes: list[str] = Field(default_factory=list)
    affected_edges: list[str] = Field(default_factory=list)
    witness_path: list[str] = Field(default_factory=list)
    expected: str | None = None
    actual: str | None = None
    confidence: float = 1.0
    repair_hint: str | None = None
    evidence: list[str] = Field(default_factory=list)
    verification_method: Method = "STATIC_GRAPH"
    verdict: Verdict = "FAIL"
    root_cause_id: str | None = None
    detected_by: str = ""
    algorithm_version: str = ""
    evidence_source: str = ""
    minimized_nodes: list[str] = Field(default_factory=list)

    def to_check_error(self) -> CheckError:
        node_id = self.affected_nodes[0] if self.affected_nodes else None
        return CheckError(code=self.code, message=self.description, node_id=node_id)


def issue_from_check_error(error: CheckError, index: int) -> Issue:
    mapping: dict[str, tuple[Category, Severity, str]] = {
        "TOOL_NOT_ALLOWED": ("structural", "HIGH", "工具不在白名单"),
        "MISSING_ON_FAIL": ("structural", "MEDIUM", "缺少 on_fail"),
        "GUARD_NOT_EXPR": ("structural", "HIGH", "守卫不是表达式"),
        "UNDEF_VAR": ("structural", "HIGH", "未定义变量"),
        "TYPE_MISMATCH": ("dataflow", "HIGH", "类型不一致"),
        "DEAD_NODE": ("executable", "MEDIUM", "不可达或无出口"),
        "MISSING_HUMAN_GATE": ("safety", "CRITICAL", "缺少审题门"),
        "CYCLE_DETECTED": ("structural", "HIGH", "图中存在环"),
    }
    category, severity, title = mapping.get(error.code, ("structural", "MEDIUM", error.code))
    method: Method = "POLICY" if error.code == "MISSING_HUMAN_GATE" else (
        "DATAFLOW" if error.code == "TYPE_MISMATCH" else "STATIC_GRAPH"
    )
    nodes = [error.node_id] if error.node_id else []
    witness = list(getattr(error, "witness", None) or [])
    return Issue(
        id=f"{error.code.lower()}_{index}",
        category=category,
        severity=severity,
        code=error.code,
        title=title,
        description=error.message,
        affected_nodes=nodes,
        witness_path=witness,
        expected=None,
        actual=error.message,
        repair_hint=_hint(error.code),
        evidence=["staticcheck"],
        verification_method=method,
        verdict="FAIL",
        detected_by="graph.integrity" if error.code != "TYPE_MISMATCH" else "dataflow.slice",
        algorithm_version="1.0",
        evidence_source="staticcheck",
    )


def _hint(code: str) -> str:
    hints = {
        "MISSING_HUMAN_GATE": "在 publish_problem 之前插入 human_gate，并接到入库边。",
        "GUARD_NOT_EXPR": "把守卫改成可解析比较式，例如 spec.n_max <= 100000。",
        "TOOL_NOT_ALLOWED": "换成当前 domain 白名单内的 tool。",
        "TYPE_MISMATCH": "对齐边两端 in_type / out_type。",
        "DEAD_NODE": "删掉孤儿节点，或补上从入口到出口的边。",
        "MISSING_ON_FAIL": "为 guard / human_gate 设置 on_fail=reject。",
        "UNDEF_VAR": "守卫只引用 spec 或已有节点 id。",
        "CYCLE_DETECTED": "去掉回边，保持 compose 图为 DAG。",
    }
    return hints.get(code, "按 expected 修正 IR。")
