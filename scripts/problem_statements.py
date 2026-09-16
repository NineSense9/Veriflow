"""OJ-complete statements for VF1001–VF1030.

Do not re-run emit_bank.main() on a seeded bank: that regenerates hidden tests.
This module only rewrites statement.md from existing public .in/.out files.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / "examples" / "problems"

# Body is 题意 + 输入 + 输出. Heading and 样例 are added from pack files.
BODIES: dict[str, str] = {
    "VF1001": """实验室门禁记下了 n 位同学每次进入后停留的秒数。请输出他们停留时间的总和。

## 输入

第一行一个整数 n（1 ≤ n ≤ 100000）。

第二行 n 个整数 t_i（0 ≤ t_i ≤ 1000000000），表示每位同学的停留秒数。

## 输出

一行一个整数，表示总和。

总和可能超过 32 位有符号整数，C++ 请使用 64 位整型。""",
    "VF1002": """课表记下了 n 天的课时。有 q 次询问，每次问某一段连续日期的课时总和。

## 输入

第一行两个整数 n 和 q（1 ≤ n, q ≤ 100000）。

第二行 n 个整数 a_1 … a_n（0 ≤ a_i ≤ 1000000000），表示每天的课时。

接下来 q 行，每行两个整数 l r（1 ≤ l ≤ r ≤ n），表示一次询问，下标从 1 开始，含两端。

## 输出

共 q 行，每行一个整数，表示区间 [l, r] 的课时和。

和可能很大，C++ 请使用 64 位整型。""",
    "VF1003": """一条走廊有 n 个格子，一开始都是 0。进行 q 次刷漆：每次把一段连续格子都加上同一个数。请输出最终每个格子的值。

## 输入

第一行两个整数 n 和 q（1 ≤ n, q ≤ 100000）。

接下来 q 行，每行三个整数 l r x（1 ≤ l ≤ r ≤ n，|x| ≤ 10000），表示把 [l, r] 每个格子都加上 x，下标从 1 开始。

## 输出

一行 n 个整数，表示最终每个格子的值，用空格隔开。""",
    "VF1004": """给定一行只含 '(' 和 ')' 的括号串，判断是否完全匹配：每个右括号都能配上前面一个还没配对的左括号，且最后没有多出来的左括号。

## 输入

一行字符串 s，只含 '(' 和 ')'（1 ≤ |s| ≤ 100000）。

## 输出

匹配输出 Yes，否则输出 No。""",
    "VF1005": """把一份成绩单按从小到大排序。

## 输入

第一行一个整数 n（1 ≤ n ≤ 100000）。

第二行 n 个整数 a_i（|a_i| ≤ 1000000000）。

## 输出

一行 n 个整数，为排序后的序列，用空格隔开。""",
    "VF1006": """从 n 个整数里找出最大值。注意 n 可能等于 1。

## 输入

第一行一个整数 n（1 ≤ n ≤ 100000）。

第二行 n 个整数 a_i（|a_i| ≤ 1000000000）。

## 输出

一行一个整数，表示最大值。""",
    "VF1007": """给定一个非降序数组 a 和一个数 x，找出第一个大于等于 x 的位置。

## 输入

第一行两个整数 n 和 x（1 ≤ n ≤ 100000，|x| ≤ 1000000000）。

第二行 n 个整数 a_1 … a_n（a_i 非降序，|a_i| ≤ 1000000000）。

## 输出

一行一个整数：第一个满足 a_i ≥ x 的下标（从 1 开始）。如果不存在，输出 n+1。""",
    "VF1008": """给定 n 个非负整数，找一段连续子数组，使其和至少为 s，且长度尽量短。

## 输入

第一行两个整数 n 和 s（1 ≤ n ≤ 100000，1 ≤ s ≤ 10^18）。

第二行 n 个整数 a_i（0 ≤ a_i ≤ 1000000000）。

## 输出

一行一个整数：最短长度。如果做不到，输出 -1。""",
    "VF1009": """有 n 道题，第 i 道耗时 t_i。你的速度是正整数 v，做一道题需要 ceil(t_i / v) 小时。希望在 h 小时内做完全部题目，求最小的速度 v。

## 输入

第一行两个整数 n 和 h（1 ≤ n ≤ 100000，n ≤ h ≤ 10^18）。

第二行 n 个整数 t_i（1 ≤ t_i ≤ 1000000000）。

## 输出

一行一个整数，表示最小速度。""",
    "VF1010": """给定一个升序数组，判断是否存在两个不同位置的数之和等于 x。

## 输入

第一行两个整数 n 和 x（2 ≤ n ≤ 100000，|x| ≤ 2000000000）。

第二行 n 个整数 a_1 … a_n（升序，|a_i| ≤ 1000000000）。

## 输出

存在输出 Yes，否则输出 No。""",
    "VF1011": """给定 n 个闭区间 [l, r]。把有重叠或端点相接的区间合并，输出合并后还剩多少个区间。

## 输入

第一行一个整数 n（1 ≤ n ≤ 100000）。

接下来 n 行，每行两个整数 l r（l ≤ r，|l|, |r| ≤ 1000000000）。

## 输出

一行一个整数，表示合并后的区间个数。""",
    "VF1012": """有 n 门课，第 i 门占用闭区间 [l, r]。选尽量多门课，使得选出的区间两两不交；端点相接也算冲突。

## 输入

第一行一个整数 n（1 ≤ n ≤ 100000）。

接下来 n 行，每行两个整数 l r（l ≤ r，|l|, |r| ≤ 1000000000）。

## 输出

一行一个整数，表示最多能选多少门。""",
    "VF1013": """n 个人排队，第 i 人办理业务需要 t_i。每个人的等待时间是排在他前面所有人办理时间之和。顺序可以重排，求最小总等待时间（所有人等待时间之和；排第一的人等待为 0）。

## 输入

第一行一个整数 n（1 ≤ n ≤ 100000）。

第二行 n 个整数 t_i（1 ≤ t_i ≤ 10000）。

## 输出

一行一个整数，表示最小总等待。""",
    "VF1014": """给定 n，构造 1 到 n 的一个排列，使得相邻两个数之差的绝对值都是奇数。

可以证明这样的排列一定存在。任意一种合法构造均可。

## 输入

第一行一个整数 n（1 ≤ n ≤ 100000）。

## 输出

一行 n 个整数，表示这个排列，用空格隔开。""",
    "VF1015": """有面额 1、5、10、25 的硬币，每种数量不限。给定金额 x，求凑出 x 所需的最少硬币数。x 可以为 0。

## 输入

第一行一个整数 x（0 ≤ x ≤ 1000000000）。

## 输出

一行一个整数，表示最少硬币数。""",
    "VF1016": """给定长度为 n 的整数序列，求最长不下降子序列的长度（可以不连续，后一项大于等于前一项）。

## 输入

第一行一个整数 n（1 ≤ n ≤ 1000）。

第二行 n 个整数 a_i（|a_i| ≤ 1000000000）。

## 输出

一行一个整数，表示长度。""",
    "VF1017": """0-1 背包：n 件物品，背包容量 m。每件物品只能选一次，第 i 件重量 w、价值 v。求不超过容量时的最大价值。

## 输入

第一行两个整数 n 和 m（1 ≤ n ≤ 100，1 ≤ m ≤ 10000）。

接下来 n 行，每行两个整数 w v（1 ≤ w ≤ m，1 ≤ v ≤ 10000）。

## 输出

一行一个整数，表示最大价值。""",
    "VF1018": """完全背包：n 种物品，每种可以选任意件，背包容量 m。第 i 种重量 w、价值 v。求不超过容量时的最大价值。

## 输入

第一行两个整数 n 和 m（1 ≤ n ≤ 100，1 ≤ m ≤ 10000）。

接下来 n 行，每行两个整数 w v（1 ≤ w ≤ m，1 ≤ v ≤ 10000）。

## 输出

一行一个整数，表示最大价值。""",
    "VF1019": """一个 n 行 m 列的网格，每格有一个非负整数。从左上走到右下，每步只能向右或向下，求路径上格子数字之和的最大值。

## 输入

第一行两个整数 n 和 m（1 ≤ n, m ≤ 200）。

接下来 n 行，每行 m 个整数 a_{i,j}（0 ≤ a_{i,j} ≤ 10000）。

## 输出

一行一个整数，表示最大路径和。""",
    "VF1020": """给定两个字符串 a 和 b，计算把 a 变成 b 的编辑距离：插入、删除、替换一个字符的代价都是 1。

## 输入

第一行字符串 a。

第二行字符串 b。

两个字符串只含小写字母，长度均为 0 到 1000（可以为空行）。

## 输出

一行一个整数，表示编辑距离。""",
    "VF1021": """n 个点 m 条双向边的无向图，边权都是 1。求从 1 号点到 n 号点最少要走几条边。到不了输出 -1。

## 输入

第一行两个整数 n 和 m（1 ≤ n ≤ 100000，0 ≤ m ≤ 200000）。

接下来 m 行，每行两个整数 u v（1 ≤ u, v ≤ n），表示一条边。可能有重边和自环。

## 输出

一行一个整数。""",
    "VF1022": """n 个点 m 条双向边的无向图，求连通块个数。孤立点也算一个连通块。

## 输入

第一行两个整数 n 和 m（1 ≤ n ≤ 100000，0 ≤ m ≤ 200000）。

接下来 m 行，每行两个整数 u v（1 ≤ u, v ≤ n）。

## 输出

一行一个整数。""",
    "VF1023": """n 门课，m 条先修关系。u → v 表示必须先修 u 再修 v。请给出一门课的修课顺序。

若存在多种合法顺序，输出字典序最小的一种（课号小的优先）。若有环导致无法修完，输出 -1。

## 输入

第一行两个整数 n 和 m（1 ≤ n ≤ 100000，0 ≤ m ≤ 200000）。

接下来 m 行，每行两个整数 u v（1 ≤ u, v ≤ n，u ≠ v）。

## 输出

若可行，一行 n 个整数，表示课号顺序，用空格隔开；否则一行一个整数 -1。""",
    "VF1024": """n 个点 m 条双向带正权边。求 1 号点到 n 号点的最短路（边权之和）。到不了输出 -1。

## 输入

第一行两个整数 n 和 m（1 ≤ n ≤ 100000，0 ≤ m ≤ 200000）。

接下来 m 行，每行三个整数 u v w（1 ≤ u, v ≤ n，1 ≤ w ≤ 10000），表示 u 与 v 之间有一条长度为 w 的边。

## 输出

一行一个整数。""",
    "VF1025": """n 个人，m 对朋友关系（朋友关系可传递）。求最大朋友圈的人数，即最大连通块大小。

## 输入

第一行两个整数 n 和 m（1 ≤ n ≤ 100000，0 ≤ m ≤ 200000）。

接下来 m 行，每行两个整数 a b（1 ≤ a, b ≤ n），表示 a 与 b 是朋友。

## 输出

一行一个整数。""",
    "VF1026": """给定两个正整数，求它们的最大公约数。

## 输入

一行两个正整数 a 和 b（1 ≤ a, b ≤ 10^18）。

## 输出

一行一个整数。""",
    "VF1027": """给定 n，求不超过 n 的质数有多少个。

## 输入

第一行一个整数 n（1 ≤ n ≤ 1000000）。

## 输出

一行一个整数。n = 1 时答案为 0。""",
    "VF1028": """计算 a 的 b 次方，结果对 1000000007 取模。b 可以为 0（此时答案为 1）。

## 输入

一行两个整数 a 和 b（0 ≤ a ≤ 1000000006，0 ≤ b ≤ 10^18）。

## 输出

一行一个整数。""",
    "VF1029": """给定长度为 n 的数组。对每个位置 i，找出它右边第一个比 a_i 更大的元素；如果没有，该位置为 -1。

## 输入

第一行一个整数 n（1 ≤ n ≤ 100000）。

第二行 n 个整数 a_i（|a_i| ≤ 1000000000）。

## 输出

一行 n 个整数，用空格隔开。""",
    "VF1030": """给定 n 个数和一个目标 x，判断是否存在两个不同下标 i、j，使得 a_i + a_j = x。

## 输入

第一行两个整数 n 和 x（1 ≤ n ≤ 100000，|x| ≤ 2000000000）。

第二行 n 个整数 a_i（|a_i| ≤ 1000000000）。

## 输出

存在输出 Yes，否则输出 No。""",
}


def fence(text: str) -> str:
    text = text.replace("\r\n", "\n")
    if text.endswith("\n"):
        text = text[:-1]
    return f"```\n{text}\n```"


def format_statement(pid: str, title: str, body: str, samples: list[tuple[str, str]]) -> str:
    body = body.strip()
    if body.startswith("# "):
        first, _, rest = body.partition("\n")
        body = rest.strip()
    parts = [f"# {pid} {title}", "", body, "", "## 样例"]
    if not samples:
        parts.extend(["", "本题暂无公开样例。"])
    for index, (stdin, stdout) in enumerate(samples, start=1):
        if len(samples) > 1:
            parts.extend(["", f"### 样例 {index}"])
        parts.extend(["", "输入", "", fence(stdin), "", "输出", "", fence(stdout)])
    return "\n".join(parts).rstrip() + "\n"


def public_samples(pack: Path) -> list[tuple[str, str]]:
    folder = pack / "tests" / "public"
    if not folder.is_dir():
        return []
    pairs: list[tuple[str, str]] = []
    for stdin_path in sorted(folder.glob("*.in")):
        stdout_path = stdin_path.with_suffix(".out")
        if not stdout_path.is_file():
            continue
        pairs.append(
            (
                stdin_path.read_text(encoding="utf-8"),
                stdout_path.read_text(encoding="utf-8"),
            )
        )
    return pairs


def audit_pack(pack: Path) -> list[str]:
    errors: list[str] = []
    spec_path = pack / "spec.json"
    statement_path = pack / "statement.md"
    if not spec_path.is_file():
        return [f"{pack.name}: missing spec.json"]
    if not statement_path.is_file():
        return [f"{pack.name}: missing statement.md"]
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    pid = spec.get("id", pack.name)
    statement = statement_path.read_text(encoding="utf-8")
    for heading in ("## 输入", "## 输出", "## 样例"):
        if heading not in statement:
            errors.append(f"{pid}: statement missing {heading}")
    samples = public_samples(pack)
    if not samples:
        errors.append(f"{pid}: no public tests")
    for stdin, stdout in samples:
        if fence(stdin) not in statement:
            errors.append(f"{pid}: public stdin not in statement")
        if fence(stdout) not in statement:
            errors.append(f"{pid}: public stdout not in statement")
    hidden = pack / "tests" / "hidden"
    hidden_ins = list(hidden.glob("*.in")) if hidden.is_dir() else []
    if not hidden_ins:
        errors.append(f"{pid}: no hidden tests")
    for stdin_path in hidden_ins:
        if not stdin_path.with_suffix(".out").is_file():
            errors.append(f"{pid}: hidden {stdin_path.name} has no .out")
    return errors


def iter_packs(bank: Path = BANK) -> list[Path]:
    return sorted(
        path
        for path in bank.iterdir()
        if path.is_dir() and (path / "spec.json").is_file()
    )


def enrich_all(bank: Path = BANK) -> list[str]:
    written: list[str] = []
    missing_bodies: list[str] = []
    for pack in iter_packs(bank):
        spec = json.loads((pack / "spec.json").read_text(encoding="utf-8"))
        pid = spec["id"]
        title = spec["title"]
        if pid not in BODIES:
            missing_bodies.append(pid)
            continue
        samples = public_samples(pack)
        (pack / "statement.md").write_text(
            format_statement(pid, title, BODIES[pid], samples),
            encoding="utf-8",
        )
        written.append(pid)
    if missing_bodies:
        raise SystemExit("no statement body for: " + ", ".join(missing_bodies))
    return written


def main() -> None:
    written = enrich_all()
    errors: list[str] = []
    for pack in iter_packs():
        errors.extend(audit_pack(pack))
    print(f"wrote {len(written)} statements")
    if errors:
        raise SystemExit("\n".join(errors))
    print("audit ok")


if __name__ == "__main__":
    main()
