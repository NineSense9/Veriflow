from __future__ import annotations

import json

from veriflow_api.db import connect

SETS = [
    {"id": "intro", "title": "入门实现", "ids": [f"VF{i}" for i in range(1001, 1007)]},
    {"id": "bs", "title": "二分 / 双指针", "ids": [f"VF{i}" for i in range(1007, 1012)]},
    {"id": "greedy", "title": "贪心", "ids": [f"VF{i}" for i in range(1012, 1016)]},
    {"id": "dp", "title": "DP", "ids": [f"VF{i}" for i in range(1016, 1021)]},
    {"id": "graph", "title": "图", "ids": [f"VF{i}" for i in range(1021, 1026)]},
    {"id": "math", "title": "数论 / 杂项", "ids": [f"VF{i}" for i in range(1026, 1031)]},
]


def summary() -> dict:
    with connect() as connection:
        problems = connection.execute("SELECT COUNT(*) AS n FROM problems WHERE published=1").fetchone()["n"]
        subs = connection.execute("SELECT COUNT(*) AS n FROM submissions").fetchone()["n"]
        ac = connection.execute("SELECT COUNT(*) AS n FROM submissions WHERE verdict='AC'").fetchone()["n"]
        wa = connection.execute("SELECT COUNT(*) AS n FROM submissions WHERE verdict='WA'").fetchone()["n"]
        hidden_wa = connection.execute(
            """
            SELECT COUNT(*) AS n FROM submissions
            WHERE verdict='WA' AND counterexample_json LIKE '%"source": "hidden"%'
            """
        ).fetchone()["n"]
        kill_rows = connection.execute(
            "SELECT kill_rate FROM problems WHERE kill_rate IS NOT NULL"
        ).fetchall()
        compose = connection.execute("SELECT COUNT(*) AS n FROM compose_projects").fetchone()["n"]
        blocked = connection.execute(
            "SELECT COUNT(*) AS n FROM compose_projects WHERE status='blocked'"
        ).fetchone()["n"]
        tutor = connection.execute("SELECT COUNT(*) AS n FROM tutor_logs").fetchone()["n"]
        stress = connection.execute("SELECT COUNT(*) AS n FROM stress_runs").fetchone()["n"]
        mismatch = connection.execute(
            "SELECT COUNT(*) AS n FROM stress_runs WHERE status='mismatch'"
        ).fetchone()["n"]
    rates = [row["kill_rate"] for row in kill_rows]
    return {
        "problems": problems,
        "submissions": subs,
        "ac": ac,
        "wa": wa,
        "hidden_wa": hidden_wa,
        "ac_rate": (ac / subs) if subs else None,
        "avg_kill_rate": (sum(rates) / len(rates)) if rates else None,
        "compose_projects": compose,
        "compose_blocked": blocked,
        "tutor_turns": tutor,
        "stress_runs": stress,
        "stress_mismatch": mismatch,
    }


def export_markdown() -> str:
    data = summary()
    lines = [
        "# 验流 Veriflow 对照摘要",
        "",
        f"- 题库题数：{data['problems']}",
        f"- 提交次数：{data['submissions']}",
        f"- AC / WA：{data['ac']} / {data['wa']}",
        f"- 隐藏测资导致的 WA：{data['hidden_wa']}",
        f"- 平均变异杀死率：{data['avg_kill_rate']}",
        f"- 出题项目 / 被静态拦住：{data['compose_projects']} / {data['compose_blocked']}",
        f"- 对拍次数 / 拍出反例：{data['stress_runs']} / {data['stress_mismatch']}",
        f"- 教练追问次数：{data['tutor_turns']}",
        "",
        "基线是只跑公开样例；完整路径包含隐藏测资、对拍和变异。数字来自当前数据库，可用 `python scripts/eval.py` 复现评测脚本。",
        "",
    ]
    return "\n".join(lines)


def sets_payload() -> dict:
    with connect() as connection:
        titles = {
            row["id"]: json.loads(row["spec_json"]).get("title")
            for row in connection.execute("SELECT id, spec_json FROM problems").fetchall()
        }
    sets = []
    for item in SETS:
        sets.append(
            {
                **item,
                "problems": [{"id": pid, "title": titles.get(pid, "")} for pid in item["ids"]],
            }
        )
    return {"sets": sets}
