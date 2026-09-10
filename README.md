# 验流 Veriflow

可验证算法训练平台。模型当编译器、攻击者和教练，**Docker 当裁判**。

仓库：<https://github.com/NineSense9/Veriflow>

面向第八届 AIC 算法创新赛 · 赛题 2「AI+软件创新」。产品对外是 ACM 训练测评站，内核是「自然语言 / 题意 → IR → 静态检查 → 沙箱执行 → 对抗测资」。设计文档见 [`docs/superpowers/specs/2026-09-10-veriflow-design.md`](docs/superpowers/specs/2026-09-10-veriflow-design.md)。

## 当前进度

- Workflow IR / Spec IR 与七条静态检查
- 进程沙箱评测（本机 Docker 未启动时自动回退）；镜像定义在 `deploy/sandbox/Dockerfile`
- 登录、题库、提交：CE / WA / TLE / RE / AC；WA 带最小反例
- 对拍台：生成器 × 暴力 × 选手，停在第一条反例；暴力超时记 stress_error
- 题包 VF1001「签到时长」（公开样例 + 隐藏 `n=1` 与 32 位溢出）
- 尚未接入 DeepSeek、对拍、教练、训练站 UI

## 开发

Python 3.11+（本机 3.14 可用）。

```text
python -m pip install -e ".[dev]"
python -m pytest
```

启动 API 与训练站：

```text
python -c "import uvicorn; uvicorn.run('veriflow_api.main:app', host='127.0.0.1', port=8000, reload=True)"
```

另开终端：

```text
cd apps/web
npm install
npm run dev
```

浏览器打开 http://127.0.0.1:3000 ，席位 `demo` / `demo`。

本地默认账号：`demo` / `demo`（出题账号 `setter` / `setter`）。正式给评委时用环境变量 `DEMO_PASSWORD`、`SETTER_PASSWORD` 覆盖，不要把正式密码提交进仓库。

```text
curl -X POST http://127.0.0.1:8000/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"demo\",\"password\":\"demo\"}"
```

Ubuntu 上构建评测镜像：

```text
docker build -t veriflow-sandbox:latest deploy/sandbox
set VERIFLOW_SANDBOX=docker
```

## 目录

```text
packages/ir            Schema
packages/staticcheck   编译期规则
packages/compare       输出比较
packages/sandbox       沙箱与判定
services/api           FastAPI
examples/problems      题包
examples/compose       出题 IR 样例
deploy/sandbox         评测镜像
apps/web               训练站（尚未接入）
```

API Key 只放服务器 `.env`，不要提交。
