# 验流 Veriflow 测试报告

数字来自仓库脚本与 pytest，复现命令见各节。测试日期：2026-09-10。

## 1. 功能测试

命令：

```text
python -m pytest
```

结果：**66 passed**。

覆盖：

| 项 | 结果 |
|---|---|
| Workflow / Spec IR 合法与非法 | 通过 |
| 七条静态规则各有反例 | 通过 |
| 出题缺审题门不能 publish | 通过 |
| 弱测资攻击未解除不能入库 | 通过 |
| 主路径 CE / WA（带反例）/ TLE / AC | 通过 |
| 对拍错解拍出 mismatch | 通过 |
| 暴力超时为 stress_error 不是 WA | 通过 |
| 教练过滤题解/代码块；AC 上禁用教练 | 通过 |
| Solver 起草仍走提交管线 | 通过 |
| 变异算子生成且隐藏测资能杀死 | 通过 |
| 题单 6 组、附录校园 IR 可解析 | 通过 |

## 2. 对照实验（scripts/eval.py）

命令：

```text
python scripts/eval.py
```

输出写入 `artifacts/eval.json`。一次实测：

| 指标 | 值 | 含义 |
|---|---|---|
| sample_only_verdict | AC | 错解（n=1 时乱输出）能骗过公开样例 |
| full_verdict | WA | 加上隐藏测资后失败 |
| full_counterexample_source | hidden | 反例来自隐藏测资，不是「WA on test 3」空话 |
| vf1001_kill_rate | 1.0 | 3/3 个变异体被现有测资杀死 |
| compose missing_gate 召回 | true | 「不要审题门」编译后静态检查命中 MISSING_HUMAN_GATE |
| compose weak_bounds 召回 | true | 「不要写数据范围守卫」被弱测资攻击命中 |

结论：只跑样例会假 AC；完整路径能抓住隐藏边界。出题侧人为注入的两类错误均可召回。

## 3. 公网抽检（116.62.5.67）

| 项 | 结果 |
|---|---|
| GET /api/health | `{"ok": true, "sandbox": "docker"}` |
| 登录 demo | 200 |
| VF1001 正确 Python 提交 | **AC docker**（约 1.7s） |
| Solver 无 Key 起草 | WA fallback，仍走沙箱 |
| 网站 /login | 200，标题「验流 Veriflow」 |

## 4. 关键用例（手工/脚本均可）

1. 做题：空 `print()` → WA + 三列反例 → 点教练，只出现问句。  
2. 做题：`print(sum(...))` → AC。  
3. 对拍：空模板对拍 VF1001 → 第 1 轮 mismatch。  
4. 出题：载入「缺审题门」→ 发布节点品红 → 入库 409。  
5. 出题：载入「完整出题图」→ 审题通过 → 入库 VF9xxx。  

## 5. 已知边界

- 无 DeepSeek Key 时 Compiler/Solver/Tutor 为启发式，不代表云端模型上限。  
- 变异只针对 Python 参考解。  
- 进程沙箱用于本机 Windows；评委环境以公网 Docker 为准。  
