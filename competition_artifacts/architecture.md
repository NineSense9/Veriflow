# Veriflow 当前架构（以仓库代码为准）

日期：2026-09-10（productization 轮已补 runtime / gate / incremental 包）  
范围：本文件只描述**已经存在并运行**的代码。n8n **live instance 仍未接**；存在的是 JSON 子集往返与 mock runtime。

分层（少 box，按层）：

1. Requirement / Spec — `packages/spec`
2. IR — `packages/ir`（compose-json；n8n subset）
3. Static verification — `staticcheck` + `packages/verify`
4. Runtime — `packages/runtime`（mock trace, temporal monitor, side-effect guard）
5. Evidence — Issue / witness / trace slice / evidence bundle
6. Repair — `packages/repair`（guard → incremental screen → full commit）
7. CI / Integration — `veriflow gate`, `.github/workflows/veriflow.yml`, optional n8n env

---

## 产品是什么

验流 Veriflow 是 **可验证算法训练平台**。

- 对外：ACM 训练测评站（题库、提交、对拍、教练、报告）
- 对内：自然语言题意 → Workflow IR → 静态检查 → 弱测资攻击 → 人工审题门 → 入库；选手代码由 **Docker / 进程沙箱** 判定，模型不当裁判

仓库：<https://github.com/NineSense9/Veriflow>  
公网 Demo：http://116.62.5.67/

## 目录与包

| 路径 | 职责 |
|---|---|
| `packages/ir/veriflow_ir` | Workflow IR + Problem Spec IR + 守卫表达式 |
| `packages/staticcheck/veriflow_staticcheck` | 七条编译期规则（白名单、on_fail、守卫、类型、死节点、审题门） |
| `packages/sandbox/veriflow_sandbox` | 沙箱工厂、评测、对拍 |
| `packages/compare/veriflow_compare` | token 比较 |
| `packages/mutate/veriflow_mutate` | Python 参考解 AST 变异与杀死率 |
| `services/api/veriflow_api` | FastAPI：登录、题库、提交、出题、教练、报告 |
| `apps/web` | Next.js 训练站 |
| `examples/problems` | VF1001–VF1030 题包 |
| `examples/compose` | 出题 IR：`valid_lis` / `missing_gate` / `missing_bounds` |
| `examples/appendix` | 报销 IR（附录，证明 IR 非 OJ 死结构） |
| `scripts/eval.py` | 对照评测 |
| `tests/` | pytest |

**仍不存在：** SMT/Z3、Dify 产品化、live n8n control plane、独立 Benchmark Dashboard 应用。n8n JSON subset 在 `packages/ir/veriflow_ir/n8n_subset.py`。

## 两套 IR

1. **ProblemSpec**（`veriflow_ir.spec`）：题目元数据、时限、样例、隐藏策略。
2. **WorkflowIR**（`veriflow_ir.workflow`）：出题图。节点 kind 仅 `tool | guard | human_gate | transform | branch | notify`。域 `compose | campus`。

出题约定边：

```text
test_generator → bounds guard → (run_brute) → human_gate → publish_problem
```

## 已有验证

`check_workflow` 确定性规则：

- `TOOL_NOT_ALLOWED`
- `MISSING_ON_FAIL`
- `GUARD_NOT_EXPR` / `UNDEF_VAR`
- `TYPE_MISMATCH`
- `DEAD_NODE`
- `MISSING_HUMAN_GATE`

`attack_compose`：弱测资（有生成器无上界）、跳过审题。

判定：沙箱 CE/WA/TLE/MLE/RE/AC，WA 带最小反例。

## 已有「修复」

`POST /api/compose/{id}/repair`：把 NL + 上次错误再交给 compiler（DeepSeek JSON 或 **关键词 fallback 换示例 IR**）。  
这是 **LLM/规则重新生成整图**，不是受约束 Patch。

## 已有变异

针对选手 **Python 参考解 AST**（比较符、range±1 等），不是对 WorkflowIR 注入 ground-truth 故障。

## 前端

训练站：工作台、题库、做题台、状态、题单、对拍、出题画布、报告、设置。  
出题页：NL → React Flow DAG → 静态错误列表 → 审题门 → 入库。  
**不是**「Upload n8n JSON → 三个 Score Card」。

## 模型

DeepSeek OpenAI 兼容，Key 仅服务端。无 Key 时 compiler / solver / tutor 走 fallback。  
角色：Compiler / Solver / Attacker / Tutor；Checker = 静态检查 + 沙箱。
