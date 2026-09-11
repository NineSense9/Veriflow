# Veriflow 创新点（hardening 后，对应代码与实验）

未落地的项标 Planned。不把静态图检查称作 formal verification。

## 1. Specification-Guided Verification

**Why:** 自然语言直接 LLM judge 不稳定、没有 constraint 级 evidence。  
**Implementation:** `packages/spec/veriflow_spec/{models,compiler,consistency,stability}.py`  
**Evaluation:** `tests/test_spec.py`, `test_spec_conflict_ordering`, heuristic spec stability jaccard.  
**Evidence:** 每个 constraint 有 PASS/FAIL/UNKNOWN 和 `verification_method`。

## 2. Multi-Dimensional Verification

**Why:** 只看节点是否存在会漏顺序、类型、密钥。  
**Implementation:** `packages/verify/veriflow_verify/{result,semantic,safety}.py` + 原 `staticcheck`.  
**Evaluation:** golden `examples/golden/case1_order.json` / `case2_dataflow.json` / `case3_safety.json`.  
**Evidence:** case2 结构完整仍 TYPE_MISMATCH；case3 结构 PASS 仍 HARDCODED_SECRET。

## 3. Counterexample + rule-based root grouping

**Why:** 分数不能答辩。  
**Implementation:** `Issue` + `packages/ir/veriflow_ir/graph.py` + `explain/rootcause.py`.  
**Evaluation:** missing_gate witness `gen → pub`.  
**Evidence:** Studio 点击 constraint 高亮 path。不是因果推断。

## 4. Minimal Guarded Repair

**Why:** 整图重写不可控。  
**Implementation:** `repair/{patch,guard,planner,select,loop,diff}.py`.  
**Evaluation:** `test_guarded_repair_fixes_missing_gate`；bench `repair_success_rate`, `average_patch_operations`, `repair_regression_rate` 来自 `experiments/runs/smoke`.  
**Evidence:** lexicographic selection；拒绝码 `REPAIR_REJECTED_REGRESSION` / `INVALID_PATCH` / `NO_IMPROVEMENT`.

## 5. Ground-truth IR mutants

**Why:** 没有 GT 就无法谈 precision/recall。  
**Implementation:** `mutate/ir_faults.py`（变更校验 `InvalidMutation`）.  
**Evaluation:** `veriflow bench` 写 metrics.json；检测与定位分列.  
**Evidence:** 数字随运行变化，禁止写死 0.94。

## 4 层技术（本轮收敛）

1. Specification-guided static verification  
2. Evidence / counterexample-guided diagnosis  
3. Minimal guarded self-repair  
4. Runtime trace conformance + incremental verification + CI reliability gate

不要再加第五个“核心创新点”。

## Runtime conformance

Mock execution produces `ExecutionTrace`. Temporal constraints compile to a deterministic monitor (`packages/runtime`). Failure emits a **trace slice** (expected vs observed predecessor), not a full log.

CASE 4 (`examples/golden/case4_runtime_ir.json`): static graph PASS, runtime `skip_after=if_pay` → IF.true then terminate, notification never runs. Pattern: **STATIC PASS + RUNTIME FAIL**.

## Incremental verification

`workflow_changes` + `impact_set` + scoped `verify_scoped`. Parameter edits re-run safety only. Topology edits fall back to full verification. Equivalence vs full is compared every time (`equivalence_report.disagreements`). Not hardcoded 100%.

Repair candidates: Patch Guard → incremental screen → full verify before accept.

## CI gate

`veriflow gate` exit 0 = READY, 1 = quality fail, 2 = tool error. Policy: `examples/veriflow-policy.yaml`. GitHub Action runs pytest + commit A PASS / commit B FAIL.

## Adapter 边界

compose-json 完整。n8n：**JSON 子集往返已测**；**live instance 未接**（无 Key 不 crash，fallback mock）。Dify：未实现。

## Partially Implemented

- Safety：config 启发式，不是完整 taint
- Spec compiler：启发式；DeepSeek 仍用于 IR 生成
- Evidence bundle：有 JSON，无独立下载按钮
- Ablation / LLM judge baseline：**未跑**，指标 N/A

## Planned

SMT/Z3、完整跨平台 adapter、训练式模型、形式化证明。
