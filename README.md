# 验流 Veriflow

**Specification-Guided Verification and Guarded Self-Repair for LLM-generated problem-setting workflows.**

中文：面向 LLM 生成出题工作流的规格驱动多维验证与受约束自修复系统。对外仍是 ACM 训练测评站；模型当编译器、攻击者和教练，**Docker 当裁判**。

仓库：<https://github.com/NineSense9/Veriflow>  
Demo：http://116.62.5.67/

## 解决什么问题

LLM 可以直接吐出题图或选手代码。不可信的是：

- 过公开样例、挂隐藏数据
- 出题图缺审题门、守卫写成自然语言、生成器从不打上界
- 用大模型当裁判：不稳定、不可复现、没有 witness

Veriflow 把流程变成：

```text
Natural Language
    → WorkflowSpec Compiler
    → ComposeJson Adapter → WorkflowIR
    → Multi-Dimensional Verification
    → Issue + witness path
    → Guarded Patch (LLM 不许整图重写)
    → Re-Verify
    → 入库 / 选手沙箱判定
```

**当前完整支持的 IR 适配器：compose-json（出题图）。** n8n / Dify / Coze 仅有接口占位，**未实现**。

## 与「直接问大模型对不对」的区别

规格编译成可检查约束，图结构、顺序、数据流、可达性、安全策略由确定性引擎给出 evidence。模型只参与：题意→IR、修复规划的可选层、教练追问。判定与静态对错不来自模型。

## 核心能力

- WorkflowSpec + WorkflowIR（Pydantic）
- 结构 / 语义约束 / 数据流 / 可达 / 安全策略
- Issue：expected / actual / witness / repair_hint
- Guarded Repair：Patch DSL + 最多 3 轮 + rollback
- 出题 Verification Studio（DAG 高亮 Issue）
- 选手侧：CE/WA/TLE/RE/AC、最小反例、对拍、变异杀死率
- IR fault-injection bench（ground truth，实测指标）

文档：

- [`docs/CURRENT_ARCHITECTURE.md`](docs/CURRENT_ARCHITECTURE.md)
- [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md)
- [`docs/INNOVATION.md`](docs/INNOVATION.md)
- [`docs/superpowers/specs/2026-09-10-veriflow-design.md`](docs/superpowers/specs/2026-09-10-veriflow-design.md)

## Quick Start

```text
python -m pip install -e ".[dev]"
python -m pytest
```

验证一条残缺出题图并受约束修复：

```text
python -m veriflow_cli verify --workflow examples/compose/missing_gate.json --nl "完整出题。" --explain
python -m veriflow_cli verify-repair --workflow examples/compose/missing_gate.json --nl "完整出题。" --max-iterations 3 --output /tmp/fixed.json
python -m veriflow_cli mutate --workflow examples/compose/valid_lis.json --fault wrong_order --output /tmp/mutated.json
python -m veriflow_cli bench --workflow examples/compose/valid_lis.json --out experiments/runs/smoke
```

训练站：

```text
python -c "import uvicorn; uvicorn.run('veriflow_api.main:app', host='127.0.0.1', port=8000, reload=True)"
```

```text
cd apps/web
npm install
npm run dev
```

http://127.0.0.1:3000  账号 `demo` / `demo`。出题页打开残缺示例后点 **受约束修复**。

## Limitations

- 不是 n8n 运行时验证器
- Safety 是风险检测，不是形式化安全证明
- Spec compiler 默认启发式；DeepSeek 用于 IR 生成，需 Key
- Bench 数字来自仓库内 gold IR 的合成变异，不是外部竞赛榜

## 目录

```text
packages/ir            WorkflowIR / ProblemSpec / adapter
packages/spec          WorkflowSpec compiler
packages/staticcheck   原七条编译期规则
packages/verify        多维验证 + Issue
packages/repair        Patch DSL + loop
packages/explain       witness 视图
packages/mutate        解法 AST 变异 + IR 故障注入
packages/sandbox       沙箱判定
packages/cli           veriflow 命令
services/api           FastAPI
apps/web               训练站 + Verification Studio
examples/compose       gold / missing_gate / missing_bounds
examples/problems      VF1001–VF1030
```

API Key 只放服务器 `.env`，不要提交。
