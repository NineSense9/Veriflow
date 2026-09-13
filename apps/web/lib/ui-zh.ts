/** User-visible Chinese. Protocol enums PASS/FAIL/READY stay English. */

export const DEMO_TITLE_ZH: Record<string, string> = {
  case1_order: "顺序失败",
  case2_dataflow: "数据流失败",
  case3_safety: "安全策略失败",
  case4_runtime: "静态通过 · 运行失败",
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
