from __future__ import annotations

import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PROMPT = ROOT / "prompts" / "tutor.txt"
REFUSAL = "对着反例检查循环边界和不变量，教练拒发题解。"

_SPOILER = (
    "标准答案",
    "题解",
    "完整代码",
    "参考代码",
    "AC代码",
    "ac代码",
    "int main",
    "#include",
    "```",
    "你可以这样写",
    "正确写法如下",
    "def solve",
)


def is_spoiler(text: str) -> bool:
    lowered = text.lower()
    if "```" in text:
        return True
    if any(token.lower() in lowered for token in _SPOILER):
        return True
    if re.search(r"\bint\s+main\s*\(", text):
        return True
    return False


def fallback_question(counterexample: dict, invariants: list[str]) -> str:
    stdin = (counterexample.get("stdin") or "").strip()
    expected = (counterexample.get("expected") or "").strip()
    actual = (counterexample.get("actual") or "").strip()
    first_line = stdin.splitlines()[0] if stdin else ""
    if not actual:
        return "反例已经读完，但标准输出是空的。总和（或题目要求的那个量）在程序结束前被写出去了吗？"
    if first_line == "1":
        return "这组数据 n=1。你写的循环或不变量在只有一个元素时还成立吗？"
    try:
        if abs(int(expected.split()[0])) > 2_000_000_000:
            return "期望值已经很大。你用来累加的类型，在这组数据上还会不会悄悄溢出？"
    except (ValueError, IndexError):
        pass
    if invariants:
        return f"对着这组输入，不变量「{invariants[0]}」在最后一个下标处还成立吗？"
    return "把输入、期望、实际三列对着看：循环走到最后一个下标时，你维护的量还对吗？"


def ask_tutor(
    counterexample: dict,
    statement: str,
    invariants: list[str],
) -> tuple[str, str, int]:
    """Return question, backend, spoiler_rejects."""
    key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    rejects = 0
    if key:
        try:
            question, rejects = _deepseek_question(counterexample, statement, invariants, key)
            if question:
                return question, "deepseek", rejects
        except Exception:
            pass
    return fallback_question(counterexample, invariants), "fallback", rejects


def _deepseek_question(
    counterexample: dict,
    statement: str,
    invariants: list[str],
    key: str,
) -> tuple[str | None, int]:
    import httpx

    system = PROMPT.read_text(encoding="utf-8")
    user = (
        f"题面摘要：\n{statement[:800]}\n\n"
        f"不变量：{invariants}\n\n"
        f"反例 stdin:\n{counterexample.get('stdin')}\n"
        f"期望:\n{counterexample.get('expected')}\n"
        f"实际:\n{counterexample.get('actual')}\n"
        "只问一个问题。"
    )
    base = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    model = os.environ.get("DEEPSEEK_MODEL", "deepseek-flash")
    rejects = 0
    for _ in range(3):
        response = httpx.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "temperature": 0.4,
            },
            timeout=30.0,
        )
        response.raise_for_status()
        content = (response.json()["choices"][0]["message"]["content"] or "").strip()
        if is_spoiler(content):
            rejects += 1
            if rejects >= 2:
                return REFUSAL, rejects
            user += "\n上一次你泄题了。禁止代码和题解，只问一个问题。"
            continue
        if content:
            return content, rejects
    return None, rejects
