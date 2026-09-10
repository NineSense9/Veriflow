# 验流 Veriflow 设计文档

日期：2026-09-10  
赛题：第八届 AIC 算法创新赛 · 赛题 2「AI+软件创新」  
产品形态：A′（对外算法训练测评平台，材料仍写方案一 + 方案二）

## 1. 背景与问题

ACM / 校赛训练站（牛客、CF、洛谷）能交题、能 AC/WA，解决不了这些痛点：

- 过公开样例，挂隐藏数据
- WA 只有 `on test 3`，没有最小反例
- 对拍要自己写生成器、暴力解、脚本
- 题解一看就会，自己想不出来
- 测资弱导致假 AC

现有 AI 编程工具（Copilot、Chat 讲题）会直接给题解，判定还常靠模型自评。拖拽 Agent 平台（Dify、Coze）把自然语言当运行时，缺类型、缺编译期检查，失败出现在执行时。

验流要做的软件不是「带聊天框的 OJ」，也不是「校园报销 Agent 套壳」。它是一个 **可验证训练平台**：模型只当编译器、出题攻击者和教练，**对错由 Docker 沙箱和静态检查说了算**。

## 2. 目标与非目标

### 2.1 目标

- 选手按 OJ 习惯：看题、写 C++17 / Python3、提交、看状态。
- 提交后跑公开样例 → 已入库的隐藏测资（含出题时攻击者写入的）→ 失败给出最小反例。
- 一键对拍：生成器 × 暴力 × 选手程序，停在第一条反例。
- 测资充分性用变异杀死率衡量（能否抓住 `>`/`>=`、循环 ±1 等）。
- 教练只引用轨迹追问，禁止贴题解。
- 出题侧：自然语言题意 → 出题工作流 IR → 静态检查 → 攻击弱测资 → 人工审题门 → 才能入库。
- 对照实验可导出，供测试报告：只跑样例 vs 完整对抗。
- 在线 Demo 跑在 Ubuntu 服务器；Key 给评委，额度后台控制。

### 2.2 非目标（本届不做）

- CF 积分天梯、讨论区、直播榜、正式比赛报名支付
- Java、交互题、Special Judge（比较器用逐 token，忽略行末空格）
- 从 CF / 洛谷 / 牛客 / LeetCode **搬运题面**（版权；赛题要求合法授权）
- 真邮箱、真 OCR、微信、对象存储生产接入
- 失败规则账本、误区出题引擎作为核心模块
- 模型担任裁判或改写 verdict
- 前端持有 API Key
- 多租户 SaaS、复杂权限

社团报销等工作流 **不作为一级入口**。同一套 Workflow IR 保留通用性，附录放一条非出题域示例（报销），证明 IR 不是为 OJ 特化的死结构。主演示与顶栏不出现报销。

## 3. 创新点（答辩必须能指着屏幕说）

一句话：**把大模型当编译器和攻击者，不当裁判。**

| 角色 | 执行者 | 禁令 |
|---|---|---|
| Compiler | DeepSeek | 不准输出自然语言守卫；只准吐符合 Schema 的 IR |
| Solver | DeepSeek | 不准自称已过隐藏测试 |
| Attacker | DeepSeek | 不准把逃逸参数送进 Docker |
| Checker | 静态检查 + Runner + Docker | **模型不得担任** |
| Tutor | DeepSeek | 不准给完整题解，只准引用轨迹追问 |

相对纯 OJ：过程可解释、有最小反例、有对拍、有测资充分性、有不剧透教练。  
相对 Chat 讲题：对错不来自模型。  
相对 Dify/Coze：先编译成带类型 IR，编译期拦住缺守卫、缺审题门、类型不一致。

首页和视频前 90 秒必须出现：出题编译失败（缺审题门/弱测资）+ 做题被隐藏数据砸出最小反例。禁止做成「看我刷了 30 题」。

## 4. 用户与场景

- **选手（主用户）：** 高校 ACM / 算法课学生。刷题单、提交、对拍、对着反例改，而不是对着题解抄。
- **出题/助教：** 用自然语言描述题意，系统编译出题图，检查测资强度后再发布。
- **评委：** 打开公网 Demo，用提供的账号和 Key 说明，走通两条主路径，下载测试报告。

主路径演示脚本（约 3 分钟）：

1. 出题：输入一段缺数据范围的题意 → 静态检查或攻击拦住 → 补上守卫和审题门 → 入库。
2. 做题：选 VF1012（带 off-by-one 陷阱）→ 一段会过样例的错解 → WA + 最小反例。
3. 对拍：同一错解被生成器拍出反例。
4. 教练：只问不变量，不贴正解。
5. 对照页：只跑样例 vs 完整对抗的数字。

## 5. 系统架构

评委打开的是 Ubuntu 上的网站。浏览器是训练站 UI，判定和模型调用都在服务器。

```text
浏览器
    │
    ▼
Ubuntu + nginx
    /        → Next.js（题库、做题、对拍、出题画布、轨迹）
    /api     → FastAPI

FastAPI
    编译 / 攻击 / 讲解 / 提交状态机 / 对拍任务
    DeepSeek 适配器（OpenAI 兼容，Key 仅服务端）
    IR 校验（JSON Schema）
    工作流 Runner（出题图，进程内）
    沙箱编排（Docker：禁网、超时、限内存）

存储
    SQLite（用户、题目、提交、IR、轨迹、评分）
    artifacts/（测资、覆盖摘要、变异报告、导出 JSON）
```

### 5.1 仓库结构

```text
veriflow/
  apps/web/                 Next.js 训练站
  services/api/             FastAPI
  packages/ir/              Workflow IR + Spec IR
  packages/staticcheck/     编译期规则
  packages/runner/          出题图执行、守卫表达式
  packages/sandbox/         Docker 评测
  packages/mutate/          针对参考解的小变异
  packages/trace/           统一轨迹
  packages/compare/         输出比较（token）
  prompts/                  五角色 system prompt
  examples/problems/        30 题机器可读题包
  examples/compose/         出题演示（含故意写残）
  examples/appendix/        报销 IR（附录，非主路径）
  tests/
  docs/
```

Python 包用可编辑安装：`pip install -e packages/ir` 等同目录。前端 Next.js **App Router**。规则不写进路由。`staticcheck` 不执行节点；`sandbox` 不生成用例；`mutate` 不评分；前端不判题。

### 5.2 模型接入

- 提供商：DeepSeek 官方，OpenAI 兼容。
- `base_url`：`https://api.deepseek.com`（也接受 `/v1`）。
- 默认模型：`deepseek-flash`（2026-09 官方当前模型；JSON Output 可用）。
- 角色用不同 system prompt，**不强制多模型路由**。可用环境变量覆盖：
  - `DEEPSEEK_API_KEY`
  - `DEEPSEEK_BASE_URL`
  - `DEEPSEEK_MODEL`（默认 `deepseek-flash`）
- 适配器接口与提供商无关，便于材料写「可换本地」。本届提交默认云端，Key 给评委，额度在 DeepSeek 控制台限制。
- 禁止把 Key 打进前端 bundle、git、截图。`.env` gitignore。

`deepseek-chat` / `deepseek-coder` 已从官方主路径退役，实现里不要写死这两个名字。

### 5.3 部署

- 开发：本机 Next 热更新，API 可指服务器。
- 提交：nginx 反代，前后端与 Docker 评测同机。
- 数据库：SQLite + WAL。轨迹可整份导出，评委不必装 Postgres。
- 并发：评测队列先 4 路 Docker；打满排队，API 进程不崩。

## 6. 中间表示

两套 Schema，都是自研 JSON，版本字段 `ir_version: "1.0"`。Compiler 只许输出通过 Schema 的 JSON。非法 JSON 在角色内重试，计入结构化输出成功率。

### 6.1 Workflow IR（方案二，出题主用）

节点 `kind` 仅六种：`tool` | `guard` | `human_gate` | `transform` | `branch` | `notify`。

出题图约定节点（演示最小集）：

```text
parse_spec (transform)
  → gen_tests (tool: test_generator)
  → bounds_guard (guard: 数据范围表达式)
  → run_brute (tool: run_brute)
  → review (human_gate: problemsetter)
  → publish (tool: publish_problem)
```

工具白名单（出题域）：`test_generator`、`run_brute`、`publish_problem`。本届无 SPJ，不设 `run_checker`。  
附录报销域另有白名单：`invoice_ocr`、`form_fill`、`oss_put`、`notify_email`。Runner 按项目 `domain` 选白名单，禁止跨域调用。

边：`from` → `to`。每个端口有 `in_type` / `out_type`（JSON Schema 子集：object/array/number/integer/string/boolean）。

`guard.expr` 必须是可解析表达式（变量、比较、逻辑、算术），禁止自然语言。

`human_gate` 在 `publish` 之前 **强制存在**（静态规则）。

示例（合法出题 IR 摘要）：

```json
{
  "ir_version": "1.0",
  "domain": "compose",
  "name": "vf1012_compose",
  "nodes": [
    {
      "id": "gen",
      "kind": "tool",
      "tool": "test_generator",
      "in_type": { "type": "object", "required": ["spec"] },
      "out_type": { "type": "object", "required": ["tests"] }
    },
    {
      "id": "g_bounds",
      "kind": "guard",
      "expr": "spec.n_min >= 1 && spec.n_max <= 100000",
      "on_fail": "reject"
    },
    {
      "id": "review",
      "kind": "human_gate",
      "assignee_role": "problemsetter",
      "on_fail": "reject"
    },
    {
      "id": "pub",
      "kind": "tool",
      "tool": "publish_problem"
    }
  ],
  "edges": [
    { "from": "gen", "to": "g_bounds" },
    { "from": "g_bounds", "to": "review" },
    { "from": "review", "to": "pub" }
  ]
}
```

### 6.2 Spec IR（题目规格，方案一）

每道题一份，存放在 `examples/problems/VFxxxx/spec.json`。

```json
{
  "ir_version": "1.0",
  "id": "VF1012",
  "title": "最短合格跨度",
  "tags": ["binary-search", "implementation"],
  "difficulty": 1200,
  "languages": ["cpp17", "python3"],
  "time_limit_ms": 1000,
  "memory_limit_mb": 256,
  "signature": {
    "input": "第一行整数 n (1≤n≤1e5)；第二行 n 个整数",
    "output": "一行一个整数"
  },
  "pre": ["n >= 1", "len(a) == n"],
  "post": ["输出为单个整数"],
  "invariants": ["答案对任意前缀判定单调"],
  "public_tests": [{ "stdin": "3\n1 3 2\n", "stdout": "2\n" }],
  "hidden_policy": "attacker+bank",
  "has_brute": true,
  "forbidden": ["交互", "读额外文件"]
}
```

Solver 输出：单文件源码 + 语言。  
Attacker 输出：`{ "stdin": "...", "expected": "...", "rationale_tag": "off_by_one" }` 数组，每项过 Schema 才进沙箱。

## 7. 静态检查

`packages/staticcheck` 纯函数：`(ir) -> Error[]`。错误带 `node_id`、`code`、`message`。

必须实现的规则：

| code | 含义 |
|---|---|
| `UNDEF_VAR` | 守卫/变换引用未定义变量 |
| `TYPE_MISMATCH` | 边两端类型不兼容 |
| `DEAD_NODE` | 从入口不可达或无出边的非终止节点 |
| `MISSING_HUMAN_GATE` | 出题域 `publish_*` / 提交类 tool 前无 `human_gate` |
| `GUARD_NOT_EXPR` | 守卫不是可解析表达式 |
| `TOOL_NOT_ALLOWED` | 工具不在当前 domain 白名单 |
| `MISSING_ON_FAIL` | guard / human_gate 缺 `on_fail` |

Compiler 根据错误列表修复，最多 **3** 轮。仍失败：停在错误面板，不试跑、不入库。

人为注入错误用于评测召回率（测试报告）：缺审题门、类型不一致、自然语言守卫、未定义变量。

## 8. 做题判定与对拍（方案一）

### 8.1 提交状态机

选手手写，或一键 Solver 起草（对照实验用）。两条入口汇入同一裁判。

```text
queued
  → compiling          → CE
  → running_public     → WA / TLE / MLE / RE
  → running_hidden     → WA / TLE / MLE / RE
  → accepted           → mutating（异步，不影响 AC 展示）
```

合法 verdict：`CE | WA | TLE | MLE | RE | AC`。  
WA **必须**带最小反例：`stdin`、`expected`、`actual`、来源（`public` / `hidden` / `stress`）。禁止只返回 `WA on test 3`。

**选手每次提交不调用 Attacker。** 隐藏测资在出题 `publish` 时固化进 `tests`（题包银行 ∪ 当时攻击者生成并通过 Schema 的用例）。避免评委刷提交打爆额度。演示「再砸一轮」只在出题页，且受每项目每小时次数上限约束。

### 8.2 对拍

独立任务，不改写已有提交的 AC。

```text
for i in 1..max_rounds (默认 50):
  input = generator()
  expected = brute(input)    # 超时则 stress_error，不是选手 WA
  actual = solution(input)
  if expected != actual: return counterexample
return no_fail
```

生成器默认按 spec 范围做模板随机（`n=1`、上界、重复元素写在 `gen.py` 里），**默认不调模型**。无 `has_brute` 的题：对拍按钮禁用，文案写明原因。

### 8.3 比较器

`packages/compare`：按空白切 token 比较，忽略行末空格和文件尾多余空行。SPJ 不实现。

### 8.4 教练

仅在 WA/RE 且已有反例时启用。输入：题面摘要、失败轨迹切片、invariants。输出：一个问题。  
若输出含代码块或「标准答案/题解/完整代码」等，丢弃并换一轮，日志记 `tutor_spoiler_rejected`。最多 2 次拒绝后返回固定句：「对着反例检查循环边界和不变量，教练拒发题解。」

### 8.5 变异充分性

对象：**本题 Python 参考解**（`ref.py`），不是选手 C++ AST。避免本届做 C++ 变异器。

算子（小而可解释）：比较符翻转 `>`/`>=`、`<`/`<=`；循环上界 ±1；提前 return；漏掉空输入分支。  
杀死：某条测资让变异体与参考解输出不同。  
杀死率 = 被杀死变异体 / 总变异体。展示在题库列和 AC 后的报告里。测资弱则杀死率低——这是给出发题侧攻击的依据。

## 9. 沙箱

- 镜像：自建 `veriflow-sandbox`，含 `g++`（`-std=c++17 -O2`）与 `python3`，无编译器网络、无评测网络（`--network=none`）。
- 只读根文件系统，工作目录 tmpfs 可写。
- 时限、内存取自题目；输出超过 2MB 记为 RE，轨迹 `detail=output_limit`，UI 文案「输出超限」。不单列 OLE 判定。
- 编译与运行分离：C++ 先编译一次，再对每组测资跑二进制。
- 墙钟超时杀掉容器。内存用 Docker `memory` 限制，超限 MLE。
- 禁止把 Attacker 的任意 argv 拼进 `docker run`。只允许内部枚举的参数。

## 10. 题库

30 题，编号 `VF1001`–`VF1030`。题面自写。题型与难度梯度参考 Codeforces 800–1600、AtCoder ABC A–D、洛谷入门–普及、ICPC 训练常识题型。文档写「题型参考公开训练体系」，不写搬运题号。

| 题单 | 编号 | 侧重 |
|---|---|---|
| 入门实现 | VF1001–1006 | 模拟、前缀和、差分、括号、排序、`n=1` 边界 |
| 二分 / 双指针 | VF1007–1011 | 最大化最小值、下界、时限类判定、对撞 |
| 贪心 | VF1012–1015 | 区间、排序贪心、构造 |
| DP | VF1016–1020 | LIS、01 背包、完全背包、网格路径、编辑距离 |
| 图 | VF1021–1025 | BFS、连通块、拓扑、Dijkstra、并查集 |
| 数论 / 杂项 | VF1026–1030 | GCD、筛质、快速幂、单调栈、哈希配对 |

每题目录：

```text
examples/problems/VF1012/
  spec.json
  statement.md
  gen.py
  brute.cpp
  brute.py
  ref.py
  tests/public/
  tests/hidden/
```

攻击错型对准：`>`/`>=`、循环 ±1、`n=1`、空序列、重复元素、取模遗漏、图不连通。  
出题演示另备 2 份故意写残的题意（缺守卫、生成器不上界），放 `examples/compose/`。

## 11. 信息架构与视觉

### 11.1 路由

| 路由 | 职责 |
|---|---|
| `/` | 训练桌：上一发反例、弱 tag、推荐题单 |
| `/login` | 演示账号登录 |
| `/problems` | 题库表 |
| `/problems/[id]` | 做题主舞台 |
| `/status` | 提交列表 |
| `/stress` | 对拍台 |
| `/sets` | 题单 |
| `/compose` | 出题编译画布 |
| `/compose/[id]` | 某次出题项目 |
| `/report` | 对照数字与导出 |
| `/settings` | 语言默认值等（无 Key 输入框） |

### 11.2 做题页布局

```text
顶栏：返回 · 题号标题 · 语言 · 提交 · 对拍 · 教练
左 ~36%  暖纸色题面
中 ~40%  Monaco
右 ~24%  测资 · 最小反例 · 变异 · 追问
底栏：    判定条 + 耗时内存
```

### 11.3 视觉

- 夜场做题桌：题面象牙纸 + 深墨字；工作区近黑，不是默认 GitHub 灰。
- 题面字体偏书刊；代码与判定等宽（JetBrains Mono）。全站禁止只用 Inter。
- 判定色：AC 磷光绿、WA 信号橙、TLE 琥珀、CE 品红、运行中冷青。无紫色渐变、无玻璃拟态营销风。
- 轨迹是时间线 + 三列（输入 / 期望 / 实际），不是聊天泡。
- 提交后判定条按 编译 → 样例 → 隐藏 前进，失败停格并展开反例。
- 空状态：未做过题则引导 VF1001；无暴力解则对拍禁用并说明。

### 11.4 出题页

上：自然语言。中：React Flow 出题图。右：静态错误 + 弱测资攻击。缺 `human_gate` 的 publish 节点红色。人工门在 IDE 内同意/驳回。

## 12. 数据模型（SQLite）

- `users`：id、name、password_hash、role（`contestant` / `setter` / `admin`）。预置 `demo`（选手）与 `setter`（出题）。密码哈希固定 **PBKDF2-HMAC-SHA256**（标准库），不引入 argon2 本地依赖。演示密码只出现在给评委的私有说明，不进仓库。
- `problems`：id、spec_json、statement、difficulty、tags、published、kill_rate 缓存。
- `tests`：problem_id、visibility（public/hidden）、stdin、stdout。
- `submissions`：user_id、problem_id、lang、source、verdict、time_ms、memory_kb、counterexample_json、trace_id。
- `stress_runs`：problem_id、user_id、status、rounds、counterexample_json。
- `compose_projects`：user_id、source_nl、ir_json、check_errors_json、status。
- `traces`：id、kind、payload_json、created_at。
- `jobs`：type、status、payload、error。



## 13. HTTP API（前缀 `/api`）

认证：登录后 session cookie（httpOnly）。演示可同时支持 `Authorization: Bearer` 方便脚本评测。

| 方法 | 路径 | 作用 |
|---|---|---|
| POST | `/auth/login` | 登录 |
| GET | `/health` | 进程与沙箱是否可用 |
| GET | `/problems` | 题库，含通过率、隐藏通过率、杀死率 |
| GET | `/problems/{id}` | 题面 + spec 公开部分（无隐藏测资） |
| POST | `/problems/{id}/submit` | 提交，返回 job_id |
| POST | `/problems/{id}/solve` | Solver 起草，仍走提交管线 |
| POST | `/problems/{id}/stress` | 对拍 |
| POST | `/problems/{id}/tutor` | 追问，需带 submission_id |
| GET | `/jobs/{id}` | 轮询状态 |
| GET | `/submissions` | 状态页数据 |
| GET | `/sets` | 题单 |
| POST | `/compose` | 从 NL 编译出题 IR |
| POST | `/compose/{id}/repair` | 带错误再编译 |
| POST | `/compose/{id}/run` | 试跑出题图 |
| POST | `/compose/{id}/attack` | 出题时生成测资写入草稿，不在选手提交路径上 |
| POST | `/compose/{id}/gate` | 人工门 |
| POST | `/compose/{id}/publish` | 检查通过才写 problems |
| GET | `/report/summary` | 对照指标 |
| GET | `/report/export` | JSON/Markdown 下载 |

所有提交类接口幂等键可选。错误体：`{ "error": { "code", "message" } }`。

## 14. 出错处理

| 情况 | 行为 |
|---|---|
| IR / 用例 JSON 不合格 | 角色内重试最多 2 次，计入成功率 |
| 编译修复 | 最多 3 轮，失败停在错误列表 |
| DeepSeek 超时或 5xx | job `queue_error`，提交保留，可重判 |
| 沙箱超时 / 超内存 | TLE / MLE，容器杀掉 |
| 输出超限 | RE + `detail=output_limit` |
| Tutor 疑似题解 | 丢弃，见 8.4 |
| 对拍无暴力解 | 按钮禁用 |
| 对拍暴力超时 | `stress_error`，不是选手 WA |
| Docker 守护进程挂 | job 失败，API 健康检查 `/api/health` 报 `sandbox_down` |

前端只渲染状态机和轨迹，不本地判题。

## 15. 测试与对照实验

### 15.1 功能测试（pytest + 前端关键路径）

- IR 合法样例通过；七条静态规则各至少 1 个反例。
- 出题缺审题门不能 publish。
- 主路径：公开样例 AC、隐藏 WA 带反例、CE、TLE。
- 对拍在故意错解上 50 轮内出反例。
- JSON 损坏重试。
- Tutor 输入含「请直接给 AC 代码」时拒绝。
- 沙箱禁网：容器内访问外网失败（实现时用 `docker run` 后 `python -c` 探测，断言非 0）。

### 15.2 对照指标（测试报告）

做题：

- 基线：Solver 只跑公开样例。
- 完整：样例 + 已入库隐藏测资 + 对拍 + 变异。
- 指标：样例通过率、隐藏通过率、对拍抓出率、变异杀死率。追问后修复率演示期人工走 3 题即可，不强制自动化。

出题：

- 基线：同一题意让模型直接吐测资文件。
- 完整：IR → 静态检查 → 攻击弱数据。
- 指标：编译成功率、注入错误召回、弱测资捕获率。

工程：JSON Schema 成功率、P95 延迟（提交到 verdict）、并发 4 路抽检。

数字必须来自本仓库脚本（`tests/eval/` 或 `scripts/eval.py`），禁止手填无法复现的表。

## 16. 与官方评分项的对应

| 官方 | 本项目落点 |
|---|---|
| 创新性 | 角色隔离；环境裁判；出题 IR 编译；变异充分性；禁剧透教练 |
| 技术实现 | 自研 Schema、静态检查、Docker 隔离、对拍、DeepSeek 结构化输出 |
| 功能完整性 | 题库、提交、状态、对拍、出题、报告导出、C++/Python |
| 方案完整性 | 本设计 + 测试报告脚本 + 部署说明 + 演示视频脚本 |
| 应用价值 | ACM 训练真实痛点；附录证明 IR 可迁到校园流程 |
| 总结展望 | SPJ、交互题、本地 Ollama、失败账本 |

提交材料按官方大纲：说明文档、测试报告、部署包/在线地址、演示视频、答辩 PPT、开源与第三方披露（DeepSeek API、Next.js、React Flow、Monaco、Docker）。

## 17. 实现顺序（目标仍是全文，但按可演示切片）

不并行铺成三个半成品。顺序锁死：

1. `ir` + `staticcheck` 单测 + 一条故意写残的出题 NL。
2. FastAPI 编译接口 + 出题画布能看到红错。
3. Docker 沙箱 + 1 题手写提交（CE/WA/AC）。
4. 对拍 + 最小反例 UI。
5. Attacker 隐藏测资 + 变异杀死率。
6. Tutor、题库 30 题、题单、状态页、报告导出。
7. 视觉按第 11 节收；附录报销 IR；部署到 Ubuntu；录视频。

第 1–4 步未绿之前，不把 30 题和 PPT 当主任务。

## 18. 风险

- **看起来像牛客：** 用首页反例、出题编译失败、报告对照压住；视频禁止刷题流水。
- **闭源 API：** Key 给评委 + 适配器可换；材料写明模型可替换。默认 `deepseek-flash`。
- **版权：** 题面自写；tag 体系可与 CF 习惯对齐但不抄题。
- **Windows 开发、Linux 评测：** 沙箱测试以服务器为准；本机可 mock runner 跑静态检查。
- **C++ 变异不做：** 杀死率基于 `ref.py`，文档写清楚，避免答辩被问「为什么没变 C++」。
- **额度：** Solver、出题编译、出题攻击、Tutor 每用户每小时限次（默认 20/10/10/30）。选手普通提交只跑沙箱，不打 DeepSeek。

## 19. 已锁定决策

- 模型：DeepSeek 官方云端，Key 给评委。
- 校赛目标：全文（两条路径 + 变异 + 对照 + 材料）。
- 运行：Ubuntu 服务器 Docker。
- 前端：Next.js + React Flow + Monaco。
- 产品：A′ 训练测评站；方案二做出题工作流。
- 语言：C++17 + Python3。
- 题库：30 道自写，题型参考大 OJ。
- 视觉：夜场做题桌，双表面。
- 库名/产品名：验流 Veriflow。

## 20. 附录：报销 IR 的存在理由

附录示例只为证明 Workflow IR 的 `domain` 可切换。不进入导航。答辩被问「是不是只能出题」时，打开附录图：发票 OCR 类型、金额守卫、人工门，规则表与出题域同一份 `staticcheck`。
