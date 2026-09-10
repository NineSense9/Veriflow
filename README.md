# 验流 Veriflow

可验证算法训练平台。模型当编译器、攻击者和教练，**Docker 当裁判**。

仓库：<https://github.com/NineSense9/Veriflow>

面向第八届 AIC 算法创新赛 · 赛题 2「AI+软件创新」。产品对外是 ACM 训练测评站，内核是「自然语言 / 题意 → IR → 静态检查 → 沙箱执行 → 对抗测资」。设计文档见 [`docs/superpowers/specs/2026-09-10-veriflow-design.md`](docs/superpowers/specs/2026-09-10-veriflow-design.md)。

## 当前进度

第一期只交付内核，**不调 DeepSeek、不起 Docker**：

- Workflow IR / Spec IR（Pydantic）
- 七条编译期静态检查
- `GET /api/health`
- `POST /api/compose/check`（缺审题门的出题图会被拦住）

## 开发

Python 3.11+（本机 3.14 可用）。

```text
python -m pip install -e ".[dev]"
python -m pytest
```

启动 API：

```text
python -c "import uvicorn; uvicorn.run('veriflow_api.main:app', host='127.0.0.1', port=8000, reload=True)"
```

试跑缺审题门示例：

```text
curl -X POST http://127.0.0.1:8000/api/compose/check -H "Content-Type: application/json" --data-binary @examples/compose/missing_gate.json
```

## 目录

```text
packages/ir            Schema
packages/staticcheck   编译期规则
services/api           FastAPI
examples/compose       出题 IR 样例
apps/web               训练站（尚未接入）
```

API Key 只放服务器 `.env`，不要提交。`.env` 已在 gitignore。
