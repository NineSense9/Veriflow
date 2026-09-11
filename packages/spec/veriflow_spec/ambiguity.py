"""Deterministic requirement quality. LLM-assisted path is not wired (no Key required)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

VAGUE = ("看起来", "感觉", "适当", "尽快", "差不多", "天气不好", "可能需要", "大概", "尽量")
MISSING_OBJECT = ("提醒我", "通知一下", "处理一下")
CONDITIONAL = ("如果", "当", "若")
THRESHOLD = ("超过", "大于", "%", "概率", "次数", "必须", "恰好")


class Ambiguity(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ambiguity_id: str
    status: str
    source_span: tuple[int, int] | None = None
    snippet: str = ""
    reason: str
    suggested_clarification: str = ""
    severity: str = "MEDIUM"
    confidence_basis: str = "keyword-rule"
    method: str = "Deterministic"


class AmbiguityReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str
    method: str = "Deterministic"
    items: list[Ambiguity] = Field(default_factory=list)


def analyze_requirement(nl: str) -> AmbiguityReport:
    text = (nl or "").strip()
    items: list[Ambiguity] = []
    if not text:
        return AmbiguityReport(
            status="UNKNOWN",
            items=[
                Ambiguity(
                    ambiguity_id="empty",
                    status="UNKNOWN",
                    reason="需求文本为空，规格将回落到平台模板。",
                    suggested_clarification="写明必须出现的动作、顺序和失败时的行为。",
                    severity="HIGH",
                )
            ],
        )
    for word in VAGUE:
        index = text.find(word)
        if index >= 0:
            items.append(
                Ambiguity(
                    ambiguity_id=f"vague_{word}",
                    status="AMBIGUOUS",
                    source_span=(index, index + len(word)),
                    snippet=word,
                    reason=f"“{word}”不是可机器检查的条件。",
                    suggested_clarification="改成可比较的谓词，例如 rainfall_probability > 0.6。",
                    severity="HIGH",
                )
            )
    if any(word in text for word in MISSING_OBJECT) and not any(k in text for k in ("邮件", "email", "通知节点", "publish")):
        items.append(
            Ambiguity(
                ambiguity_id="missing_object",
                status="AMBIGUOUS",
                reason="提到提醒/处理但没有可绑定的动作或通道。",
                suggested_clarification="写明通道（邮件/站内）和触发对象。",
            )
        )
    if any(word in text for word in CONDITIONAL) and not any(word in text for word in THRESHOLD):
        items.append(
            Ambiguity(
                ambiguity_id="condition_no_threshold",
                status="AMBIGUOUS",
                reason="有条件句但没有可验证阈值或谓词。",
                suggested_clarification="为 IF 分支给出可解析表达式。",
            )
        )
    if ("不要审题" in text or "跳过审题" in text or "直接入库" in text) and ("完整出题" in text or "必须审" in text):
        items.append(
            Ambiguity(
                ambiguity_id="contradict_gate",
                status="CONTRADICTORY",
                reason="同时要求跳过审题门和完整出题/必须审。",
                suggested_clarification="只保留一个：发布前审题，或明确这是负例。",
                severity="CRITICAL",
            )
        )
    if "无法验证" in text or "人工判断即可" in text:
        items.append(
            Ambiguity(
                ambiguity_id="unsupported",
                status="UNSUPPORTED",
                reason="需求声明不可机器验证。",
                suggested_clarification="拆成结构/顺序/安全等可检查约束。",
                severity="HIGH",
            )
        )
    if not items:
        return AmbiguityReport(status="CLEAR", items=[])
    rank = {"CONTRADICTORY": 4, "UNSUPPORTED": 3, "AMBIGUOUS": 2, "UNKNOWN": 1, "CLEAR": 0}
    status = max((item.status for item in items), key=lambda key: rank.get(key, 0))
    return AmbiguityReport(status=status, items=items)
