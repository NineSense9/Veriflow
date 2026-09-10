# Veriflow 创新点

以仓库实现为准。未落地的项标为 **Planned**。

## Implemented

### 1. Specification-Guided Workflow Verification

自然语言题意先编译为 `WorkflowSpec`（必选动作、基数、顺序、数据依赖、安全策略），再对 `WorkflowIR` 做确定性检查。

- 代码：`packages/spec/veriflow_spec`
- Compiler 默认是启发式、可复现；无 API Key 也能跑
- 允许手动提交 Spec JSON（`veriflow_spec.parser`）
- 不把「prompt + 整图 → LLM pass/fail」当作主验证器

### 2. Multi-Dimensional Verification

`verify_workflow` 输出 PASS/WARNING/FAIL、risk_level、按维 Issue，而不是一个神秘加权分。

| 维 | 来源 |
|---|---|
| structural | 原七条静态检查 |
| semantic | Spec 约束（存在、基数、顺序） |
| dataflow | 类型边 + Spec 数据依赖 |
| executable | 不可达 / 无出口 |
| safety | 审题门、弱上界、硬编码密钥、外发 URL（risk detected，不是绝对安全证明） |

兼容字段 `score_compat.S/M/E` 仍给出 0/1，但不是产品主叙事。

### 3. Counterexample-Guided Explanation

统一 `Issue`：code、expected、actual、affected_nodes、witness_path、repair_hint。

缺审题门时 witness 是入口到 `publish_problem` 的实际路径。

前端 Verification Studio 点击 Issue 高亮 DAG。

### 4. Guarded Self-Repair

LLM **不再**被当成「整图重写器」的唯一修复路径。

- Patch DSL：`add_node` / `connect_nodes` / `disconnect_nodes` / `update_condition` / `update_node_parameter` …
- Planner 根据 Issue 提出 Patch
- Guard 拒绝白名单外 tool、拒绝非法图
- Executor 确定性改 IR
- Loop：最多 3 轮，质量不升则 rollback，重复失败则停

旧接口 `POST /api/compose/{id}/repair`（再编译整图）保留。  
新接口 `POST /api/compose/{id}/verify-repair` 与 `POST /api/verify-repair`。

### 5. Ground-Truth Fault Injection Benchmark

对 gold 出题 IR（`examples/compose/valid_lis.json`）注入：

orphan_node、broken_edge、missing_required_action、wrong_order、missing_branch、wrong_parameter、broken_binding、hardcoded_secret、unsafe_webhook

并记录 expected_detection。`veriflow bench` 计算 detection P/R/F1、localization、repair success。数字来自当次运行，不写死 95%。

选手参考解 AST 变异（kill rate）仍在 `veriflow_mutate.ops`，未删除。

### 6. Adapter 边界（诚实）

- **完整支持：** compose-json WorkflowIR（出题图；附录 campus 报销图同一套 IR）
- **架构预留、未实现：** n8n / Dify adapter 会 `NotImplementedError`

## Partially Implemented

- Safety taint：目前是 config 密钥键 + URL 启发式，不是完整跨节点污点传播图
- Spec compiler：启发式为主；DeepSeek 仍用于 **IR 生成**（旧 compiler），尚未把 LLM 接到 Spec JSON schema
- Repair planner：确定性规则覆盖主故障类，不是通用 LLM patch 生成器

## Planned

- n8n / Dify / Coze / Zapier 完整 adapter
- SMT / Z3
- Ablation 矩阵自动跑满（structural-only vs spec+repair 等 CLI 开关可后补）
- 跨模型 workflow 生成对照（无 Key 时不伪造）
- 独立 Benchmark Dashboard 页（现可通过 `GET /api/bench/latest` 读实测文件，未跑则 `NOT RUN`）
