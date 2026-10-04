# VeriFlow 当前架构（以仓库代码为准）

核对日期：2026-10-05。参赛说明以 `docs/contest/` 为准。9 月 10 日旧稿里的这些说法已经作废：公网入口不带端口、修复只是整图重生成、没有评测基准页、测试只有数十项。

公网演示：http://116.62.5.67:8081/
在线软件提交：以同一端口下 `/api/version` 为准；87257ea 为历史发布记录。
仓库：<https://github.com/NineSense9/Veriflow>

80 端口是主机默认站点。VeriFlow 在 8081。

## 产品是什么

VeriFlow 检查大模型或手工产生的出题工作流，并用沙箱判断选手程序。模型可以提案。门禁只读验证器的结果。

对外页面：控制台、题库训练、沙箱判题、智能对拍、出题质检、需求出题。验证实验室含评测基准、证据链分析、算法矩阵、系统架构、历史记录。

## 分层

1. 需求 / 规格 — `packages/spec`
2. 中间表示 — `packages/ir`（compose-json；n8n 仅节点和连线子集往返）
3. 静态验证 — `packages/verify` 的结构、语义、数据流、可达、安全；`packages/staticcheck` 保留编译期规则
4. 运行 — `packages/runtime` 的模拟执行与时序监视
5. 证据 — 问题、见证、轨迹；前端可导出 JSON / Markdown，`not_a_formal_proof` 为真
6. 修复 — `packages/repair` 的 `verify_repair_loop`（补丁、拒绝、回滚）。按题意重编译整图是另一条草稿路径，不计入基准接受率
7. 门禁 — `veriflow gate`。模型不作为输入
8. 判题 — `packages/sandbox`、对拍、Python 参考解变异
9. 基准 — `scripts/competition_benchmark.py`，结果在 `experiments/runs/competition/`

接口在 `services/api`，页面在 `apps/web`。nginx 的 8081 把 `/api` 转到 8010，其余转到 127.0.0.1:3000。

## 基准口径

competition-v2：5 条正常流程，50 条故障，合计 55。完整模式检测 F1 为 1.000，诊断 1.000，定位 0.700，45条静态故障中修复结束后静态PASS为38条，比例38/45 = 0.844。四行消融已写入 `ablation.json`。大模型对照是 NOT RUN。增量加速 NOT MEASURED。`experiments/runs/smoke/` 只作冒烟，不作为主结果。

## 仍然没有的东西

SMT/Z3、Dify、真实 n8n、特殊评判、交互题、Java、C++ 语法树变异。安全检查和证据包都不是形式化证明。
