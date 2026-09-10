from __future__ import annotations

import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PROMPT = ROOT / "prompts" / "solver.txt"

PYTHON_STUB = """n = int(input())
a = list(map(int, input().split()))
print()
"""

CPP_STUB = """#include <iostream>
using namespace std;
int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);
  int n;
  cin >> n;
  return 0;
}
"""


def fallback_source(lang: str) -> str:
    return PYTHON_STUB if lang == "python3" else CPP_STUB


def solve(statement: str, lang: str) -> tuple[str, str]:
    key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if key:
        try:
            source = _deepseek_solve(statement, lang, key)
            if source.strip():
                return source, "deepseek"
        except Exception:
            pass
    return fallback_source(lang), "fallback"


def _deepseek_solve(statement: str, lang: str, key: str) -> str:
    import httpx

    system = PROMPT.read_text(encoding="utf-8")
    label = "Python 3" if lang == "python3" else "C++17"
    user = f"语言：{label}\n\n题面：\n{statement[:4000]}\n\n只输出完整源码。"
    base = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    model = os.environ.get("DEEPSEEK_MODEL", "deepseek-flash")
    response = httpx.post(
        f"{base}/chat/completions",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
        },
        timeout=45.0,
    )
    response.raise_for_status()
    content = (response.json()["choices"][0]["message"]["content"] or "").strip()
    fence = re.search(r"```(?:python|cpp|c\+\+)?\s*(.*?)```", content, re.S | re.I)
    if fence:
        return fence.group(1).strip() + "\n"
    return content + "\n"
