# Veriflow 2.0 升级计划（对照真实仓库）

赛题 Prompt 按「LLM 生成 n8n 工作流打分器」书写。本仓库实际是 **出题工作流 + ACM 评测**。升级必须落在已有 IR 上，禁止假装已经支持 n8n。

核心理念映射：

```text
自然语言题意 / 平台策略
    → WorkflowSpec Compiler
    → ComposeJson Adapter → WorkflowIR
    → 多维验证（结构 / 规格约束 / 数据流 / 可达 / 安全策略）
    → Issue + witness path
    → Guarded Patch（LLM 只许提议，执行器确定性改图）
    → 再验证
    → 出题图可入库 + 证据
```

主产品（选手提交、沙箱、对拍、教练）保持不变。

## Gap

| Prompt 项 | 现状 | 处理 |
|---|---|---|
| WorkflowSpec | 只有 ProblemSpec | **P0** 新增需求规格，不替代题目 Spec |
| WorkflowIR | 已有 | **P0** 加 Adapter 协议；Compose JSON 完整支持 |
| n8n/Dify/Coze/Zapier | 无 | **Planned**，adapter 抛 NotImplementedError |
| 约束语义验证 | 七条图规则 + 关键词攻击 | **P0** 规格约束（存在、基数、顺序、分支） |
| Issue + witness | `code/message/node_id` | **P0** 统一 Issue |
| Guarded Repair | 整图重编译 | **P0** Patch DSL + 循环 |
| Safety / taint | 弱测资、审题门 | **P0** 策略 + 硬编码密钥检测（声明为 risk detected） |
| IR Fault injection | 仅解法 AST | **P0** 对 WorkflowIR 变异 + ground truth |
| Bench 指标 | eval.py / kill_rate | **P0** detection P/R/F1 等，只报实测 |
| Verification Studio | 出题画布 | **P0** 在出题页加状态/Issue/高亮/受约束修复 |
| Ablation / 跨模型 / 报告生成器 | 弱或无 | **P1** |
| SMT/Z3、更多 adapter | 无 | **P2 Planned** |

## 本轮落地（P0）

已实现并有测试：Spec compiler、Issue、多维 verify、Guarded repair loop、IR mutation bench、CLI、`/api/verify` `/api/verify-repair` `/api/mutate`、出题 Verification Studio。

旧 `/api/compose/*`、七条静态检查、沙箱评测均保留。

## 不做

- 把产品改成 n8n checker
- 伪造 95% 实验
- 用加权总分包装成算法创新
- 删除旧静态检查 / 旧 `/api/compose/*`
- 让 LLM 自由重写整份 IR 并称之为 Guarded Repair
