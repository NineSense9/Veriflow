# Veriflow Judge + Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 选手可以登录、看题、提交 Python3/C++17，得到 CE/WA/TLE/MLE/RE/AC；WA 必须带最小反例。本机 Docker 守护进程未开时用进程沙箱跑测，Ubuntu 上走 Docker。

**Architecture:** `veriflow_compare` 只比 token；`veriflow_sandbox` 提供 `Sandbox` 协议（process / docker）和 `judge_submission` 状态机；API 用 SQLite 存用户、题目、测资、提交、任务。提交路径不调 DeepSeek、不对拍、不变异。

**Tech Stack:** 标准库 sqlite3 / subprocess / hashlib；已有 FastAPI。Docker 镜像 `veriflow-sandbox`（g++ + python3）。

**Spec:** 设计文档第 8.1、8.3、9、12、13 节。

---

## File structure

- Create: `packages/compare/veriflow_compare/*`
- Create: `packages/sandbox/veriflow_sandbox/*`
- Create: `services/api/veriflow_api/db.py`
- Create: `services/api/veriflow_api/auth.py`
- Create: `services/api/veriflow_api/seed.py`
- Modify: `services/api/veriflow_api/main.py`
- Create: `examples/problems/VF1001/**`
- Create: `deploy/sandbox/Dockerfile`
- Create: `.env.example`
- Create: `tests/test_compare.py`
- Create: `tests/test_judge.py`
- Create: `tests/test_submit_api.py`
- Modify: `tests/test_api.py`, `tests/conftest.py`, `pyproject.toml`, `README.md`

---

### Task 1: Token 比较器

- [x] 测试：忽略行末空格、文件尾空行、CRLF；`"1 2"` vs `"1\n2"` 视为相同；`"6"` vs `"3"` 不同。
- [x] 实现 `outputs_equal(actual, expected) -> bool`
- [x] `python -m pytest tests/test_compare.py -v` 通过
- [x] Commit `feat(compare): token-wise output compare`

### Task 2: 进程沙箱 + 判定状态机

- [x] `Sandbox.compile` / `Sandbox.run`；Process 实现用 `sys.executable` 与 `g++`
- [x] `judge_submission`：queued→compiling→public→hidden→AC；公开失败不跑隐藏
- [x] 测：Python AC / WA 带 `stdin,expected,actual,source=public` / CE / TLE
- [x] C++ 在 `g++` 存在时测 AC（`long long`）
- [x] Docker 实现写入但测试在守护进程未启动时 skip
- [x] Commit `feat(sandbox): process judge with CE/WA/TLE/AC`

### Task 3: VF1001 题包 + SQLite 种子

- [x] 自写题面「签到时长」；公开小数据，隐藏含 `n=1` 与 32 位溢出
- [x] 启动时建表并导入 `examples/problems/*`
- [x] 预置 `demo` / `setter`，密码来自环境变量，缺省仅本地开发
- [x] Commit `feat(problems): add VF1001 and sqlite seed`

### Task 4: 登录与提交 API

- [x] `POST /api/auth/login` → Bearer + httpOnly cookie
- [x] `GET /api/problems`、`GET /api/problems/{id}` 不返回隐藏测资
- [x] `POST /api/problems/{id}/submit` → job；本阶段同步评测
- [x] `GET /api/jobs/{id}`、`GET /api/submissions`
- [x] `GET /api/health` 的 `sandbox` 为 `process` 或 `docker`
- [x] 测试：未登录 401；登录后提交 AC/WA；题目详情无 hidden
- [x] Commit `feat(api): login, problems, and submission judging`

### Task 5: Dockerfile、README、推送

- [x] `deploy/sandbox/Dockerfile`
- [x] README 写提交方式与沙箱回退
- [x] 全量 pytest 绿
- [x] Push `origin main`
