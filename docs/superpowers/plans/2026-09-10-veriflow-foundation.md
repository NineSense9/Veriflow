# Veriflow Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地可测试的内核：仓库骨架、Workflow/Spec IR、七条静态检查、FastAPI `/api/health` 与 `/api/compose/check`（本阶段不调 DeepSeek、不起 Docker）。

**Architecture:** Python 单仓多包。`veriflow_ir` 只负责 Schema；`veriflow_staticcheck` 纯函数出错误列表；`veriflow_api` 只做 HTTP 适配。守卫表达式按 Python AST 解析，输入里的 `&&`/`||` 先规范化成 `and`/`or`。

**Tech Stack:** Python 3.11+、Pydantic v2、FastAPI、pytest。前端与沙箱不在本计划。

**Spec:** `docs/superpowers/specs/2026-09-10-veriflow-design.md`

**后续计划（本文件不实现）：** 沙箱评测与提交；对拍/变异/教练；30 题与训练站 UI；Ubuntu 部署。

---

## File structure

- Create: `.gitignore`
- Create: `README.md`
- Create: `pyproject.toml`
- Create: `packages/ir/veriflow_ir/__init__.py`
- Create: `packages/ir/veriflow_ir/workflow.py`
- Create: `packages/ir/veriflow_ir/spec.py`
- Create: `packages/ir/veriflow_ir/expr.py`
- Create: `packages/staticcheck/veriflow_staticcheck/__init__.py`
- Create: `packages/staticcheck/veriflow_staticcheck/whitelist.py`
- Create: `packages/staticcheck/veriflow_staticcheck/check.py`
- Create: `services/api/veriflow_api/__init__.py`
- Create: `services/api/veriflow_api/main.py`
- Create: `examples/compose/valid_lis.json`
- Create: `examples/compose/missing_gate.json`
- Create: `tests/test_workflow_ir.py`
- Create: `tests/test_spec_ir.py`
- Create: `tests/test_expr.py`
- Create: `tests/test_staticcheck.py`
- Create: `tests/test_api.py`
- Create: `tests/conftest.py`

---

### Task 1: 仓库骨架

**Files:**
- Create: `.gitignore`
- Create: `pyproject.toml`
- Create: `README.md`

- [x] **Step 1: 写 `.gitignore`**

```
.env
.env.*
!.env.example
__pycache__/
*.py[cod]
.pytest_cache/
.mypy_cache/
.ruff_cache/
.venv/
venv/
dist/
build/
*.egg-info/
artifacts/
*.db
*.sqlite
node_modules/
.next/
apps/web/out/
.DS_Store
Thumbs.db
```

- [x] **Step 2: 写 `pyproject.toml`**

```toml
[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "veriflow"
version = "0.1.0"
description = "验流 Veriflow — 可验证算法训练平台"
requires-python = ">=3.11"
dependencies = [
  "pydantic>=2.7",
  "fastapi>=0.115",
  "uvicorn[standard]>=0.30",
]

[project.optional-dependencies]
dev = ["pytest>=8", "httpx>=0.27"]

[tool.setuptools.packages.find]
where = ["packages/ir", "packages/staticcheck", "services/api"]
include = ["veriflow_ir*", "veriflow_staticcheck*", "veriflow_api*"]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["packages/ir", "packages/staticcheck", "services/api"]
```

- [x] **Step 3: 写 README 标题与仓库地址（完整 README 在 Task 8 补）**

最小内容包含产品名「验流 Veriflow」、仓库 `https://github.com/NineSense9/Veriflow`、一句话：模型当编译器与攻击者，Docker 当裁判。

- [x] **Step 4: Commit**

```bash
git add .gitignore pyproject.toml README.md
git commit -m "chore: bootstrap Veriflow monorepo skeleton"
```

---

### Task 2: Workflow IR

**Files:**
- Create: `packages/ir/veriflow_ir/workflow.py`
- Create: `packages/ir/veriflow_ir/__init__.py`
- Test: `tests/test_workflow_ir.py`

- [x] **Step 1: 写失败测试**

```python
import pytest
from pydantic import ValidationError
from veriflow_ir.workflow import WorkflowIR, NODE_KINDS


def test_parse_valid_compose_ir():
    ir = WorkflowIR.model_validate(
        {
            "ir_version": "1.0",
            "domain": "compose",
            "name": "vf1012_compose",
            "nodes": [
                {
                    "id": "gen",
                    "kind": "tool",
                    "tool": "test_generator",
                    "in_type": {"type": "object", "required": ["spec"]},
                    "out_type": {"type": "object", "required": ["tests"]},
                },
                {
                    "id": "g_bounds",
                    "kind": "guard",
                    "expr": "spec.n_min >= 1 && spec.n_max <= 100000",
                    "on_fail": "reject",
                },
                {
                    "id": "review",
                    "kind": "human_gate",
                    "assignee_role": "problemsetter",
                    "on_fail": "reject",
                },
                {"id": "pub", "kind": "tool", "tool": "publish_problem"},
            ],
            "edges": [
                {"from": "gen", "to": "g_bounds"},
                {"from": "g_bounds", "to": "review"},
                {"from": "review", "to": "pub"},
            ],
        }
    )
    assert ir.name == "vf1012_compose"
    assert ir.node_map()["pub"].tool == "publish_problem"
    assert set(NODE_KINDS) == {
        "tool",
        "guard",
        "human_gate",
        "transform",
        "branch",
        "notify",
    }


def test_reject_unknown_kind():
    with pytest.raises(ValidationError):
        WorkflowIR.model_validate(
            {
                "ir_version": "1.0",
                "domain": "compose",
                "name": "bad",
                "nodes": [{"id": "a", "kind": "magic"}],
                "edges": [],
            }
        )


def test_reject_wrong_version():
    with pytest.raises(ValidationError):
        WorkflowIR.model_validate(
            {
                "ir_version": "2.0",
                "domain": "compose",
                "name": "bad",
                "nodes": [],
                "edges": [],
            }
        )
```

- [x] **Step 2: 运行测试确认失败**

Run: `python -m pytest tests/test_workflow_ir.py -v`

Expected: FAIL，`veriflow_ir` 未安装或 `WorkflowIR` 未定义。

- [x] **Step 3: 实现 `workflow.py`**

- `ir_version` 仅 `"1.0"`
- `domain` 仅 `"compose"` | `"campus"`
- `kind` 仅六种
- `Edge` 字段 JSON 名为 `from`（Pydantic alias `from_`）
- `node_map()` 返回 `id -> Node`
- 重复 `id` 在 model validator 里拒绝

- [x] **Step 4: 运行测试确认通过**

Run: `python -m pytest tests/test_workflow_ir.py -v`

Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/ir tests/test_workflow_ir.py
git commit -m "feat(ir): add workflow IR pydantic schema"
```

---

### Task 3: Spec IR

**Files:**
- Create: `packages/ir/veriflow_ir/spec.py`
- Test: `tests/test_spec_ir.py`

- [x] **Step 1: 写失败测试**，校验设计文档 6.2 的 VF1012 字段：`id`、`title`、`tags`、`difficulty`、`languages`、`time_limit_ms`、`memory_limit_mb`、`signature`、`pre`、`post`、`invariants`、`public_tests`、`hidden_policy`、`has_brute`、`forbidden`。`languages` 仅 `cpp17` | `python3`。缺 `id` 应 ValidationError。

- [x] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_spec_ir.py -v`

- [x] **Step 3: 实现 `ProblemSpec`**

- [x] **Step 4: 测试通过**

- [x] **Step 5: Commit** `feat(ir): add problem spec IR`

---

### Task 4: 守卫表达式

**Files:**
- Create: `packages/ir/veriflow_ir/expr.py`
- Test: `tests/test_expr.py`

- [x] **Step 1: 写失败测试**

```python
from veriflow_ir.expr import GuardExprError, free_names, parse_guard


def test_js_logic_and_comparison():
    tree = parse_guard("spec.n_min >= 1 && spec.n_max <= 100000")
    assert tree is not None
    assert free_names("spec.n_min >= 1 && spec.n_max <= 100000") == {"spec"}


def test_reject_natural_language():
    try:
        parse_guard("金额看起来对")
        assert False, "should reject"
    except GuardExprError:
        pass


def test_reject_import():
    try:
        parse_guard("__import__('os').system('x')")
        assert False, "should reject"
    except GuardExprError:
        pass
```

规则：

- 先把 `&&` → ` and `、`||` → ` or `
- `ast.parse(..., mode="eval")`
- 只允许常量、名字、属性、下标、比较、布尔、加减乘除模、`min/max/len/abs`
- 整棵树若只是一个 Name（自然语言）→ `GuardExprError`
- 禁止 `Call` 到白名单以外的函数，禁止 `Attribute` 名为 `__...__`

- [x] **Step 2–4:** 先红后绿

- [x] **Step 5: Commit** `feat(ir): parse guard expressions via AST`

---

### Task 5: 七条静态检查

**Files:**
- Create: `packages/staticcheck/veriflow_staticcheck/whitelist.py`
- Create: `packages/staticcheck/veriflow_staticcheck/check.py`
- Create: `packages/staticcheck/veriflow_staticcheck/__init__.py`
- Test: `tests/test_staticcheck.py`

白名单（设计文档 6.1）：

- compose: `test_generator`, `run_brute`, `publish_problem`
- campus: `invoice_ocr`, `form_fill`, `oss_put`, `notify_email`

`check_workflow(ir) -> list[CheckError]`，`CheckError` 含 `code`、`message`、`node_id`。

| code | 测法 |
|---|---|
| `MISSING_HUMAN_GATE` | 有 `publish_problem`，到它的每条路径都没有 `human_gate` |
| `TYPE_MISMATCH` | 边两端 `out_type.type` 与 `in_type.type` 都有且不同 |
| `UNDEF_VAR` | 守卫 `free_names` 不在默认绑定 `{"spec","input","output","tests"}` ∪ 节点 id |
| `DEAD_NODE` | 从入度为 0 的节点 BFS 不可达，或非终止节点出度为 0。终止：`publish_problem` / `notify` / `notify_email` / `oss_put` |
| `GUARD_NOT_EXPR` | `kind==guard` 且 `parse_guard` 失败 |
| `TOOL_NOT_ALLOWED` | tool 不在当前 domain 白名单 |
| `MISSING_ON_FAIL` | `guard` 或 `human_gate` 无 `on_fail` |

- [x] **Step 1:** `tests/test_staticcheck.py` 七条各一个正例/反例。合法出题图（与 Task 2 相同结构）错误列表为空。

- [x] **Step 2:** `python -m pytest tests/test_staticcheck.py -v` 失败

- [x] **Step 3:** 实现纯函数检查，不调模型、不执行节点

- [x] **Step 4:** 测试通过

- [x] **Step 5: Commit** `feat(staticcheck): implement seven compile-time rules`

---

### Task 6: 出题示例 JSON

**Files:**
- Create: `examples/compose/valid_lis.json`
- Create: `examples/compose/missing_gate.json`

- [x] **Step 1:** 合法图与缺审题门图写入 examples

- [x] **Step 2:** 测试读文件：合法图 `check_workflow` 为空；缺门图含 `MISSING_HUMAN_GATE`

在 `tests/test_staticcheck.py` 增加 `test_examples_on_disk`

- [x] **Step 3–4:** 红绿

- [x] **Step 5: Commit** `feat(examples): add compose IR fixtures`

---

### Task 7: FastAPI 健康检查与 IR 校验接口

**Files:**
- Create: `services/api/veriflow_api/main.py`
- Create: `services/api/veriflow_api/__init__.py`
- Create: `tests/test_api.py`
- Create: `tests/conftest.py`

- [x] **Step 1: 写失败测试**

```python
from fastapi.testclient import TestClient
from veriflow_api.main import app

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["sandbox"] == "unconfigured"


def test_compose_check_missing_gate():
    import json
    from pathlib import Path

    data = json.loads(Path("examples/compose/missing_gate.json").read_text(encoding="utf-8"))
    r = client.post("/api/compose/check", json=data)
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert any(e["code"] == "MISSING_HUMAN_GATE" for e in body["errors"])


def test_compose_check_valid():
    import json
    from pathlib import Path

    data = json.loads(Path("examples/compose/valid_lis.json").read_text(encoding="utf-8"))
    r = client.post("/api/compose/check", json=data)
    assert r.status_code == 200
    assert r.json()["ok"] is True
```

非法 JSON Schema（缺 `ir_version`）应 422。

- [x] **Step 2:** 运行失败

- [x] **Step 3:** 实现路由。`GET /api/health`、`POST /api/compose/check`。本阶段 `sandbox` 恒为 `"unconfigured"`。不读 `.env`、不调 DeepSeek。

- [x] **Step 4:** `python -m pytest tests -v` 全绿

- [x] **Step 5: Commit** `feat(api): add health and compose IR check endpoints`

---

### Task 8: README 与推送

**Files:**
- Modify: `README.md`

- [x] **Step 1:** README 写清：产品定位、本阶段能跑什么、如何 `pip install -e ".[dev]"`、`python -m pytest`、`uvicorn veriflow_api.main:app --reload --app-dir services/api` 不可靠时改用 `pythonpath`：

```
python -m pip install -e ".[dev]"
python -m pytest
python -c "import uvicorn; uvicorn.run('veriflow_api.main:app', host='127.0.0.1', port=8000, reload=True)"
```

说明 Key 与 Docker 尚未接入。链接设计文档路径。

- [x] **Step 2:** 全量测试再跑一遍

- [x] **Step 3: Commit & push**

```bash
git add README.md
git commit -m "docs: explain foundation slice and how to run tests"
git push origin main
```

---

## Self-review

- Spec 6.1/6.2/7/13 的 `/health` 与 compose 校验已覆盖；提交/沙箱/DeepSeek 明确留待下一计划。
- 无 TBD。守卫 `&&` 与文档示例一致。
- 类型名：`WorkflowIR`、`ProblemSpec`、`CheckError`、`check_workflow` 前后统一。
