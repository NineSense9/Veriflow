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

## Adapter 边界

完整支持 compose-json。n8n/Dify：**NOT IMPLEMENTED**（`NotImplementedError`）。

## Partially Implemented

- Safety：config 启发式，不是完整 taint
- Spec compiler：启发式；DeepSeek 仍用于 IR 生成
- Evidence bundle：有 JSON，无独立下载按钮
- Ablation / LLM judge baseline：**未跑**，指标 N/A

## Planned

SMT/Z3、完整跨平台 adapter、训练式模型、形式化证明。
