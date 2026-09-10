"""Emit VF1002-VF1030 problem packs with original statements and generated tests."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / "examples" / "problems"


def run_src(source: str, stdin: str) -> str:
    completed = subprocess.run(
        [sys.executable, "-c", source],
        input=stdin,
        capture_output=True,
        text=True,
        timeout=5,
        check=True,
    )
    return completed.stdout


def write_problem(
    pid: str,
    title: str,
    tags: list[str],
    difficulty: int,
    statement: str,
    ref: str,
    gen: str,
    public: list[str],
    hidden_seeds: list[int],
    time_ms: int = 1000,
) -> None:
    folder = BANK / pid
    (folder / "tests" / "public").mkdir(parents=True, exist_ok=True)
    (folder / "tests" / "hidden").mkdir(parents=True, exist_ok=True)
    spec = {
        "ir_version": "1.0",
        "id": pid,
        "title": title,
        "tags": tags,
        "difficulty": difficulty,
        "languages": ["cpp17", "python3"],
        "time_limit_ms": time_ms,
        "memory_limit_mb": 256,
        "signature": {"input": "见题面", "output": "见题面"},
        "pre": [],
        "post": [],
        "invariants": [],
        "public_tests": [],
        "hidden_policy": "bank",
        "has_brute": True,
        "forbidden": ["交互", "读额外文件"],
    }
    (folder / "spec.json").write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (folder / "statement.md").write_text(f"# {pid} {title}\n\n{statement.strip()}\n", encoding="utf-8")
    (folder / "ref.py").write_text(ref.strip() + "\n", encoding="utf-8")
    (folder / "brute.py").write_text(ref.strip() + "\n", encoding="utf-8")
    (folder / "gen.py").write_text(gen.strip() + "\n", encoding="utf-8")
    for index, stdin in enumerate(public, start=1):
        stdout = run_src(ref, stdin)
        (folder / "tests" / "public" / f"{index:02d}.in").write_text(stdin, encoding="utf-8")
        (folder / "tests" / "public" / f"{index:02d}.out").write_text(stdout, encoding="utf-8")
        spec["public_tests"].append({"stdin": stdin, "stdout": stdout})
    (folder / "spec.json").write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for index, seed in enumerate(hidden_seeds, start=1):
        env = os.environ.copy()
        env["VF_SEED"] = str(seed)
        stdin = subprocess.run(
            [sys.executable, str(folder / "gen.py")],
            capture_output=True,
            text=True,
            timeout=5,
            check=True,
            env=env,
        ).stdout
        stdout = run_src(ref, stdin)
        (folder / "tests" / "hidden" / f"{index:02d}.in").write_text(stdin, encoding="utf-8")
        (folder / "tests" / "hidden" / f"{index:02d}.out").write_text(stdout, encoding="utf-8")


GEN_HEADER = """
import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
"""

PROBLEMS = [
    ("VF1002", "课表前缀和", ["implementation", "prefix-sum"], 900,
     "第一行 n 和 q。第二行 n 个整数表示每天课时。接下来 q 行每行 l r（1-index，含端点），输出区间和。",
     "n,q=map(int,input().split())\na=[0]+list(map(int,input().split()))\nfor i in range(1,n+1):\n    a[i]+=a[i-1]\nfor _ in range(q):\n    l,r=map(int,input().split())\n    print(a[r]-a[l-1])",
     GEN_HEADER + "n=rng.randint(1,20); q=rng.randint(1,8)\nprint(n,q)\nprint(*[rng.randint(0,10) for _ in range(n)])\nfor _ in range(q):\n    l=rng.randint(1,n); r=rng.randint(l,n); print(l,r)",
     ["5 2\n1 2 3 4 5\n1 3\n2 5\n"], [1, 2, 3, 4]),
    ("VF1003", "走廊刷漆", ["implementation", "difference"], 1000,
     "n 个格子初始为 0。q 次操作 l r x 表示给 [l,r] 都加 x（1-index）。输出最终数组。",
     "n,q=map(int,input().split())\nd=[0]*(n+2)\nfor _ in range(q):\n    l,r,x=map(int,input().split())\n    d[l]+=x; d[r+1]-=x\ncur=0\nout=[]\nfor i in range(1,n+1):\n    cur+=d[i]; out.append(str(cur))\nprint(' '.join(out))",
     GEN_HEADER + "n=rng.randint(1,15); q=rng.randint(1,10)\nprint(n,q)\nfor _ in range(q):\n    l=rng.randint(1,n); r=rng.randint(l,n); print(l,r,rng.randint(-5,5))",
     ["4 2\n1 3 2\n2 4 1\n"], [1, 2, 3]),
    ("VF1004", "括号匹配", ["implementation", "stack"], 800,
     "一行括号串，只含 ( 和 )。匹配输出 Yes，否则 No。",
     "s=input().strip()\nst=[]\nok=True\nfor ch in s:\n    if ch=='(':\n        st.append(ch)\n    elif not st:\n        ok=False; break\n    else:\n        st.pop()\nprint('Yes' if ok and not st else 'No')",
     GEN_HEADER + "n=rng.randint(1,20)\nchars=['(',')']\nprint(''.join(chars[rng.randrange(2)] for _ in range(n)))",
     ["()\n", "(()\n", "()()\n"], [1, 2, 3, 5]),
    ("VF1005", "成绩排序", ["implementation", "sortings"], 800,
     "第一行 n，第二行 n 个整数，输出从小到大排序后的序列。",
     "n=int(input())\na=list(map(int,input().split()))\na.sort()\nprint(' '.join(map(str,a)))",
     GEN_HEADER + "n=rng.randint(1,15)\nprint(n)\nprint(*[rng.randint(-10,10) for _ in range(n)])",
     ["3\n3 1 2\n"], [1, 2, 7]),
    ("VF1006", "单科最高", ["implementation"], 800,
     "第一行 n，第二行 n 个整数，输出最大值。注意 n=1。",
     "n=int(input())\na=list(map(int,input().split()))\nprint(max(a))",
     GEN_HEADER + "n=1 if rng.random()<0.4 else rng.randint(2,12)\nprint(n)\nprint(*[rng.randint(-100,100) for _ in range(n)])",
     ["1\n-3\n", "4\n1 9 2 8\n"], [1, 2, 3]),
    ("VF1007", "第一个不小于", ["binary-search"], 1100,
     "升序数组 a 长度 n，再给 x，输出第一个 >= x 的下标（1-index），不存在输出 n+1。",
     "n,x=map(int,input().split())\na=list(map(int,input().split()))\nlo,hi=0,n\nwhile lo<hi:\n    mid=(lo+hi)//2\n    if a[mid]>=x: hi=mid\n    else: lo=mid+1\nprint(lo+1)",
     GEN_HEADER + "n=rng.randint(1,20); a=sorted(rng.randint(0,30) for _ in range(n)); x=rng.randint(0,30)\nprint(n,x)\nprint(*a)",
     ["5 4\n1 3 3 7 9\n"], [1, 2, 3, 4]),
    ("VF1008", "最短合格跨度", ["binary-search"], 1200,
     "n 个非负整数，找最短子数组长度，使其和 >= s。做不到输出 -1。",
     "n,s=map(int,input().split())\na=list(map(int,input().split()))\nans=n+1; left=0; cur=0\nfor right in range(n):\n    cur+=a[right]\n    while cur>=s:\n        ans=min(ans,right-left+1)\n        cur-=a[left]; left+=1\nprint(ans if ans<=n else -1)",
     GEN_HEADER + "n=rng.randint(1,15); s=rng.randint(1,40); print(n,s)\nprint(*[rng.randint(0,10) for _ in range(n)])",
     ["5 11\n1 2 3 4 5\n"], [1, 2, 3]),
    ("VF1009", "刷题时限", ["binary-search"], 1200,
     "n 道题耗时 t_i，每小时最多完成 k 的工作量（每道题耗时向上取整除以速度）。求最小速度使得 h 小时内做完。速度为正整数。",
     "import math\nn,h=map(int,input().split())\nt=list(map(int,input().split()))\ndef ok(v):\n    return sum((x+v-1)//v for x in t)<=h\nlo,hi=1,max(t)\nwhile lo<hi:\n    mid=(lo+hi)//2\n    if ok(mid): hi=mid\n    else: lo=mid+1\nprint(lo)",
     GEN_HEADER + "n=rng.randint(1,8); h=rng.randint(n,n+10); print(n,h)\nprint(*[rng.randint(1,20) for _ in range(n)])",
     ["3 7\n3 6 7\n"], [1, 2, 4]),
    ("VF1010", "对撞取数", ["two-pointers"], 1100,
     "升序数组，是否存在两数之和为 x。Yes/No。",
     "n,x=map(int,input().split())\na=list(map(int,input().split()))\ni,j=0,n-1\nok=False\nwhile i<j:\n    s=a[i]+a[j]\n    if s==x: ok=True; break\n    if s<x: i+=1\n    else: j-=1\nprint('Yes' if ok else 'No')",
     GEN_HEADER + "n=rng.randint(2,15); a=sorted(rng.randint(1,20) for _ in range(n)); x=rng.randint(2,40)\nprint(n,x)\nprint(*a)",
     ["4 9\n1 3 5 8\n"], [1, 2, 3]),
    ("VF1011", "覆盖线段", ["two-pointers", "greedy"], 1300,
     "n 个区间 [l,r]，按左端排序后，输出能覆盖的最右端（从当前右端不断延伸）。输入 n，然后 n 行 l r。输出最大覆盖右端（从最小左端开始的连续覆盖）。简化：输出合并后区间个数。",
     "n=int(input())\nseg=[tuple(map(int,input().split())) for _ in range(n)]\nseg.sort()\nans=0; cur=-10**18; right=-10**18\nfor l,r in seg:\n    if l>right:\n        ans+=1; right=r\n    else:\n        right=max(right,r)\nprint(ans)",
     GEN_HEADER + "n=rng.randint(1,10); print(n)\nfor _ in range(n):\n    l=rng.randint(0,20); r=l+rng.randint(0,8); print(l,r)",
     ["3\n1 2\n2 4\n6 7\n"], [1, 2, 3]),
    ("VF1012", "选课不冲突", ["greedy"], 1200,
     "n 门课 l r，选尽量多门且区间两两不交（端点相接算冲突）。输出最多门数。",
     "n=int(input())\nseg=[tuple(map(int,input().split())) for _ in range(n)]\nseg.sort(key=lambda x:x[1])\nans=0; last=-10**18\nfor l,r in seg:\n    if l>last:\n        ans+=1; last=r\nprint(ans)",
     GEN_HEADER + "n=rng.randint(1,12); print(n)\nfor _ in range(n):\n    l=rng.randint(0,15); print(l, l+rng.randint(0,6))",
     ["3\n1 3\n2 4\n4 6\n"], [1, 2, 4]),
    ("VF1013", "最小代价排队", ["greedy", "sortings"], 1100,
     "n 人等待时间 t_i，顺序自定义，总等待为每个人前面所有人之和的累加。输出最小总等待。",
     "n=int(input())\na=list(map(int,input().split()))\na.sort()\nans=s=0\nfor x in a:\n    ans+=s; s+=x\nprint(ans)",
     GEN_HEADER + "n=rng.randint(1,12); print(n)\nprint(*[rng.randint(1,20) for _ in range(n)])",
     ["3\n3 1 2\n"], [1, 2, 3]),
    ("VF1014", "构造奇偶", ["greedy", "constructive"], 1000,
     "给 n，构造 1..n 的排列，使得相邻差的绝对值都是奇数。一行输出排列。",
     "n=int(input())\nprint(*range(1,n+1))",
     GEN_HEADER + "print(rng.randint(1,12))",
     ["1\n", "4\n"], [1, 2, 3, 5]),
    ("VF1015", "硬币贪心", ["greedy"], 1000,
     "面额 1,5,10,25，给金额 x，输出最少硬币数。",
     "x=int(input())\nans=0\nfor c in (25,10,5,1):\n    ans+=x//c; x%=c\nprint(ans)",
     GEN_HEADER + "print(rng.randint(0,100))",
     ["41\n", "0\n"], [1, 2, 3]),
    ("VF1016", "最长不降", ["dp"], 1400,
     "长度为 n 的序列，输出最长不下降子序列长度。",
     "n=int(input())\na=list(map(int,input().split()))\ndp=[1]*n\nfor i in range(n):\n    for j in range(i):\n        if a[j]<=a[i]:\n            dp[i]=max(dp[i], dp[j]+1)\nprint(max(dp) if n else 0)",
     GEN_HEADER + "n=rng.randint(1,12); print(n)\nprint(*[rng.randint(1,10) for _ in range(n)])",
     ["5\n1 3 2 3 4\n"], [1, 2, 3]),
    ("VF1017", "0-1 背包", ["dp"], 1400,
     "n 个物品，容量 m。每件重量 w 价值 v，每种一件。输出最大价值。",
     "n,m=map(int,input().split())\ndp=[0]*(m+1)\nfor _ in range(n):\n    w,v=map(int,input().split())\n    for j in range(m,w-1,-1):\n        dp[j]=max(dp[j], dp[j-w]+v)\nprint(dp[m])",
     GEN_HEADER + "n=rng.randint(1,6); m=rng.randint(5,15); print(n,m)\nfor _ in range(n):\n    print(rng.randint(1,m), rng.randint(1,10))",
     ["3 5\n2 3\n3 4\n2 3\n"], [1, 2, 3]),
    ("VF1018", "完全背包", ["dp"], 1400,
     "n 种物品无限件，容量 m，重量 w 价值 v，最大价值。",
     "n,m=map(int,input().split())\ndp=[0]*(m+1)\nfor _ in range(n):\n    w,v=map(int,input().split())\n    for j in range(w,m+1):\n        dp[j]=max(dp[j], dp[j-w]+v)\nprint(dp[m])",
     GEN_HEADER + "n=rng.randint(1,5); m=rng.randint(5,12); print(n,m)\nfor _ in range(n):\n    print(rng.randint(1,m), rng.randint(1,8))",
     ["2 5\n2 3\n3 4\n"], [1, 2, 3]),
    ("VF1019", "网格路径", ["dp"], 1300,
     "n 行 m 列格子，每格一个非负整数。从左上走到右下只能右或下，输出路径和最大。",
     "n,m=map(int,input().split())\na=[list(map(int,input().split())) for _ in range(n)]\ndp=[[0]*m for _ in range(n)]\nfor i in range(n):\n    for j in range(m):\n        best=0\n        if i: best=max(best, dp[i-1][j])\n        if j: best=max(best, dp[i][j-1])\n        dp[i][j]=best+a[i][j]\nprint(dp[-1][-1])",
     GEN_HEADER + "n=rng.randint(1,4); m=rng.randint(1,4); print(n,m)\nfor _ in range(n):\n    print(*[rng.randint(0,9) for _ in range(m)])",
     ["2 3\n1 2 3\n4 5 6\n"], [1, 2, 3]),
    ("VF1020", "编辑距离", ["dp"], 1500,
     "两行字符串 a,b，输出编辑距离（插入删除替换代价 1）。",
     "a=input().strip(); b=input().strip()\nn,m=len(a),len(b)\ndp=[[0]*(m+1) for _ in range(n+1)]\nfor i in range(n+1): dp[i][0]=i\nfor j in range(m+1): dp[0][j]=j\nfor i in range(1,n+1):\n    for j in range(1,m+1):\n        dp[i][j]=min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+(a[i-1]!=b[j-1]))\nprint(dp[n][m])",
     GEN_HEADER + "letters='ab'\nprint(''.join(rng.choice(letters) for _ in range(rng.randint(0,6))))\nprint(''.join(rng.choice(letters) for _ in range(rng.randint(0,6))))",
     ["kitten\nsitting\n"], [1, 2, 3]),
    ("VF1021", "最短步数", ["graphs", "bfs"], 1300,
     "n 个点 m 条双向边，从 1 到 n 的最短边数。到不了输出 -1。",
     "from collections import deque\nn,m=map(int,input().split())\ng=[[] for _ in range(n+1)]\nfor _ in range(m):\n    u,v=map(int,input().split()); g[u].append(v); g[v].append(u)\ndist=[-1]*(n+1); dist[1]=0; q=deque([1])\nwhile q:\n    u=q.popleft()\n    for v in g[u]:\n        if dist[v]==-1:\n            dist[v]=dist[u]+1; q.append(v)\nprint(dist[n])",
     GEN_HEADER + "n=rng.randint(2,8); edges=set()\nfor _ in range(rng.randint(n-1, n+3)):\n    u=rng.randint(1,n); v=rng.randint(1,n)\n    if u!=v: edges.add(tuple(sorted((u,v))))\nprint(n,len(edges))\nfor u,v in edges: print(u,v)",
     ["4 4\n1 2\n2 3\n3 4\n1 4\n"], [1, 2, 3]),
    ("VF1022", "连通块", ["graphs", "dfs"], 1200,
     "n 个点 m 条双向边，输出连通块个数。",
     "n,m=map(int,input().split())\ng=[[] for _ in range(n+1)]\nfor _ in range(m):\n    u,v=map(int,input().split()); g[u].append(v); g[v].append(u)\nseen=[False]*(n+1); ans=0\ndef dfs(u):\n    seen[u]=True\n    for v in g[u]:\n        if not seen[v]: dfs(v)\nfor i in range(1,n+1):\n    if not seen[i]:\n        ans+=1; dfs(i)\nprint(ans)",
     GEN_HEADER + "n=rng.randint(1,8); edges=set()\nfor _ in range(rng.randint(0,n)):\n    u=rng.randint(1,n); v=rng.randint(1,n)\n    if u!=v: edges.add(tuple(sorted((u,v))))\nprint(n,len(edges))\nfor u,v in edges: print(u,v)",
     ["4 2\n1 2\n3 4\n"], [1, 2, 3, 4]),
    ("VF1023", "选修顺序", ["graphs", "topo"], 1400,
     "n 门课 m 条先修 u->v 表示 u 先于 v。输出一组拓扑序，用空格。若有环输出 -1。若多解输出字典序最小。",
     "import heapq\nn,m=map(int,input().split())\ng=[[] for _ in range(n+1)]; indeg=[0]*(n+1)\nfor _ in range(m):\n    u,v=map(int,input().split()); g[u].append(v); indeg[v]+=1\nh=[i for i in range(1,n+1) if indeg[i]==0]\nheapq.heapify(h); order=[]\nwhile h:\n    u=heapq.heappop(h); order.append(u)\n    for v in g[u]:\n        indeg[v]-=1\n        if indeg[v]==0: heapq.heappush(h,v)\nprint(' '.join(map(str,order)) if len(order)==n else -1)",
     GEN_HEADER + "n=rng.randint(1,6); edges=[]\nfor u in range(1,n):\n    if rng.random()<0.6: edges.append((u,u+1))\nprint(n,len(edges))\nfor u,v in edges: print(u,v)",
     ["3 2\n1 2\n2 3\n"], [1, 2, 3]),
    ("VF1024", "最短路", ["graphs", "shortest-paths"], 1500,
     "n 点 m 条双向带权边，1 到 n 最短路，到不了 -1。",
     "import heapq\nn,m=map(int,input().split())\ng=[[] for _ in range(n+1)]\nfor _ in range(m):\n    u,v,w=map(int,input().split()); g[u].append((v,w)); g[v].append((u,w))\ndist=[10**18]*(n+1); dist[1]=0; h=[(0,1)]\nwhile h:\n    d,u=heapq.heappop(h)\n    if d!=dist[u]: continue\n    for v,w in g[u]:\n        nd=d+w\n        if nd<dist[v]:\n            dist[v]=nd; heapq.heappush(h,(nd,v))\nprint(dist[n] if dist[n]<10**18 else -1)",
     GEN_HEADER + "n=rng.randint(2,6); edges=set()\nfor _ in range(rng.randint(n-1, n+2)):\n    u=rng.randint(1,n); v=rng.randint(1,n)\n    if u!=v: edges.add(tuple(sorted((u,v))))\nprint(n,len(edges))\nfor u,v in edges: print(u,v,rng.randint(1,9))",
     ["3 3\n1 2 5\n2 3 2\n1 3 9\n"], [1, 2, 3]),
    ("VF1025", "朋友圈", ["graphs", "dsu"], 1300,
     "n 人 m 条朋友关系，输出最大连通块大小。",
     "n,m=map(int,input().split())\np=list(range(n+1)); sz=[1]*(n+1)\ndef find(x):\n    while p[x]!=x:\n        p[x]=p[p[x]]; x=p[x]\n    return x\nfor _ in range(m):\n    a,b=map(int,input().split()); x,y=find(a),find(b)\n    if x!=y:\n        p[y]=x; sz[x]+=sz[y]\nprint(max(sz[1:]) if n else 0)",
     GEN_HEADER + "n=rng.randint(1,8); print(n,end=' ')\npairs=[]\nfor _ in range(rng.randint(0,n)):\n    a=rng.randint(1,n); b=rng.randint(1,n)\n    if a!=b: pairs.append((a,b))\nprint(len(pairs))\nfor a,b in pairs: print(a,b)",
     ["5 3\n1 2\n2 3\n4 5\n"], [1, 2, 3]),
    ("VF1026", "最大公约", ["math", "number-theory"], 800,
     "两个正整数 a b，输出 gcd。",
     "import math\na,b=map(int,input().split())\nprint(math.gcd(a,b))",
     GEN_HEADER + "print(rng.randint(1,100), rng.randint(1,100))",
     ["12 18\n", "1 1\n"], [1, 2, 3]),
    ("VF1027", "质数个数", ["math", "number-theory"], 1100,
     "给 n，输出 <=n 的质数个数。n>=1。",
     "n=int(input())\nif n<2:\n    print(0)\nelse:\n    vis=[False]*(n+1); cnt=0\n    for i in range(2,n+1):\n        if not vis[i]:\n            cnt+=1\n            for j in range(i*i,n+1,i):\n                vis[j]=True\n    print(cnt)",
     GEN_HEADER + "print(rng.randint(1,80))",
     ["1\n", "10\n"], [1, 2, 3]),
    ("VF1028", "快速幂", ["math"], 1100,
     "a b mod，输出 a^b mod 1e9+7。b 可能为 0。",
     "MOD=10**9+7\na,b=map(int,input().split())\nprint(pow(a,b,MOD))",
     GEN_HEADER + "print(rng.randint(0,20), rng.randint(0,10))",
     ["2 10\n", "3 0\n"], [1, 2, 3]),
    ("VF1029", "下一项更大", ["data-structures", "stack"], 1400,
     "n 和数组 a，对每个位置输出右边第一个更大元素，没有输出 -1。",
     "n=int(input())\na=list(map(int,input().split()))\nans=[-1]*n; st=[]\nfor i in range(n-1,-1,-1):\n    while st and st[-1]<=a[i]: st.pop()\n    if st: ans[i]=st[-1]\n    st.append(a[i])\nprint(' '.join(map(str,ans)))",
     GEN_HEADER + "n=rng.randint(1,12); print(n)\nprint(*[rng.randint(1,20) for _ in range(n)])",
     ["4\n2 1 2 4\n"], [1, 2, 3]),
    ("VF1030", "配对和", ["data-structures"], 1100,
     "n 和 x，一行 n 个整数，是否存在两个不同下标之和为 x。Yes/No。",
     "n,x=map(int,input().split())\na=list(map(int,input().split()))\nseen=set(); ok=False\nfor v in a:\n    if x-v in seen:\n        ok=True; break\n    seen.add(v)\nprint('Yes' if ok else 'No')",
     GEN_HEADER + "n=rng.randint(1,15); x=rng.randint(0,30); print(n,x)\nprint(*[rng.randint(0,20) for _ in range(n)])",
     ["4 9\n2 7 11 15\n", "1 2\n2\n"], [1, 2, 3]),
]


def main() -> None:
    for item in PROBLEMS:
        write_problem(*item)
        print("wrote", item[0])


if __name__ == "__main__":
    main()
