/** User-visible Chinese. Protocol enums PASS/FAIL/READY stay English. */

export const DEMO_TITLE_ZH: Record<string, string> = {
  case1_order: "顺序失败",
  case2_dataflow: "数据流失败",
  case3_safety: "安全策略失败",
  case4_runtime: "静态通过 · 运行失败",
};

export const DEMO_SCENARIO_ZH: Record<string, { title: string; scenario: string; verdict: string }> = {
  case4_runtime: {
    title: "AI 自动出题与发布流水线",
    scenario: "大模型尝试构建出题流程：「AI测资生成 → 数据范围校验 → 分支判定 → 助教通知 → 专家审题 → 题目发布入库」。",
    verdict: "静态连线全部通畅（静态 PASS），但沙箱模拟运行时发现：分支异常导致通知与审题步骤被绕过。VeriFlow 强制触发发布门禁熔断（BLOCKED），杜绝残缺题目流入 OJ 题库！",
  },
  case1_order: {
    title: "步骤顺序颠倒缺陷",
    scenario: "大模型构建的出题流中，在测试数据尚未生成完毕前就提前调用了发布工具。",
    verdict: "违反时序前置依赖约束。静态检查当场标红并拦截，防止空测资题目入库。",
  },
  case2_dataflow: {
    title: "测资类型与沙箱不匹配",
    scenario: "出题流水线中生成器产出的测试用例格式与后续判题沙箱所需输入存在关键字段缺失。",
    verdict: "数据流绑定检查失败，触发门禁拦截，避免线上学生提交判题时引发沙箱崩溃。",
  },
  case3_safety: {
    title: "缺少人工审题门禁",
    scenario: "大模型直接将自动生成的题目发布入库，流程中没有放置任何人工确认门（Human Gate）。",
    verdict: "违反发布安全策略（MISSING_HUMAN_GATE）。发布门禁强制阻断，必须有人工打勾才能放行。",
  },
};

export const PIPELINE_ZH: Record<string, string> = {
  parse: "解析",
  spec: "规格",
  ir: "中间表示",
  static: "静态",
  semantic: "语义",
  dataflow: "数据流",
  safety: "安全",
  runtime: "运行",
  repair: "修复",
};

export const ARCH_TITLE_ZH: Record<string, string> = {
  "web-ui": "Web 控制台",
  api: "FastAPI",
  "nl-ir": "自然语言 → 中间表示",
  spec: "规格编译",
  structural: "图完整性",
  semantic: "语义约束",
  safety: "安全策略",
  dataflow: "数据流",
  "runtime-mock": "模拟执行",
  "runtime-monitor": "时序监视",
  "runtime-align": "轨迹对齐",
  incremental: "增量影响",
  "ai-repair": "AI 补丁提案",
  "repair-guard": "补丁守卫",
  "repair-select": "候选选择",
  "repair-loop": "验证-修复循环",
  gate: "发布门禁",
  explain: "反例切片",
  mutate: "中间表示变异评测",
  sqlite: "SQLite 记录",
};

export function demoTitle(id: string, fallback?: string) {
  return DEMO_TITLE_ZH[id] || fallback || id;
}

export function pipelineLabel(id: string, fallback?: string) {
  return PIPELINE_ZH[id] || fallback || id;
}

/** Display labels only: never use these strings for validation or API values. */
const STATUS_ZH: Record<string, string> = {
  PASS: "通过", FAIL: "失败", READY: "可发布", BLOCKED: "已拦截",
  WARNING: "警告", UNKNOWN: "未知", "REVIEW REQUIRED": "待人工确认",
  REVIEW: "待复核", NOT_RUN: "未运行", "NOT RUN": "未运行",
  NOT_APPLICABLE: "不适用", NOT_USED: "未使用", USED: "已使用",
  APPLIED: "已应用", NOT_APPLIED: "未应用", IMPROVED: "已改善",
  MATCH: "一致", MISMATCH: "不一致", COVERED: "已覆盖", UNMAPPED: "未映射",
  RUNNING: "运行中", QUEUED: "排队中", SUGGESTED: "待确认建议",
  AMBIGUOUS: "存在歧义", HIGH: "高风险", LOW: "低风险", MEDIUM: "中风险",
  CRITICAL: "严重", COMPLETED: "已完成", SUCCESS: "成功", SKIPPED: "已跳过",
  ERROR: "执行错误", FAILED: "失败", TRUE: "成立", FALSE: "不成立",
  AC: "通过", WA: "答案错误", TLE: "运行超时", RE: "运行错误", CE: "编译错误",
};

export function statusLabel(value: string | null | undefined) {
  if (!value) return "—";
  const label = STATUS_ZH[value.toUpperCase()];
  return label ? `${label} · ${value}` : value;
}

const CATEGORY_ZH: Record<string, string> = {
  structural: "结构", semantic: "语义", dataflow: "数据流", safety: "安全",
  runtime: "运行时", repair: "修复", incremental: "增量验证", graph: "图算法",
  specification: "规格", spec: "规格", compiler: "编译", explain: "证据解释",
  deterministic: "确定性", ai_assisted: "AI 辅助", mutation: "变异测试",
  temporal: "时序", action: "动作", ordering: "顺序", trigger: "触发",
  testing: "测试", gate: "发布门禁", requirement: "需求", executable: "静态可达",
};

export function categoryLabel(value: string) {
  return CATEGORY_ZH[value.toLowerCase()] || value;
}
