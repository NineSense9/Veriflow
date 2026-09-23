/** User-visible Chinese. Protocol enums PASS/FAIL/READY stay English. */

export const DEMO_TITLE_ZH: Record<string, string> = {
  case4_runtime: "静态全绿 · 动态沙箱断流 (典型案例)",
  case1_order: "前置缺失 · 测资未成提前发布",
  case2_dataflow: "接口崩溃 · 测资类型与沙箱不符",
  case3_safety: "越权违规 · 缺少专家人工审题门",
};

export type RoleStory = {
  input: string;
  defect: string;
  defense: string;
  defectTitle?: string;
  defectTag?: string;
};

export const DEMO_SCENARIO_ZH: Record<
  string,
  { title: string; scenario: string; verdict: string; roleStory: RoleStory }
> = {
  case4_runtime: {
    title: "AI 自动出题流水线（时序违规与沙箱截断）",
    scenario: "大模型尝试构建端到端出题流程：「AI测资生成 → 范围守卫 → 外部准入判定 → 助教审核通知 → 专家审题门 → 题目发布入库」。",
    verdict: "静态连线与拓扑结构检查全部通过（静态 7 项检查全为 PASS）。但在沙箱动态仿真执行时发现：第 3 步前置准入判定因外部条件未满足导致流程异常中断，后续「助教审核通知」与「专家审题门」未被触发。VeriFlow 依形式化安全规约触发发布门禁熔断 (BLOCKED)，阻止残缺试题流入题库。",
    roleStory: {
      input: "大模型（AI Agent）编排了 6 步出题任务链（静态拓扑结构连线完备）。",
      defect: "动态沙箱仿真运行至「外部准入判定」即异常终止，导致后续专家审核与入库节点未能到达。",
      defense: "VeriFlow 捕获反例时序切片，门禁判定 BLOCKED，阻止未完备试题污染题库。",
      defectTitle: "静态分析全绿，沙箱捕获致命断流",
      defectTag: "运行时断流 · 捕获最小反例",
    },
  },
  case1_order: {
    title: "步骤顺序颠倒缺陷（测资尚未生成即尝试入库）",
    scenario: "大模型构建的出题流中，在测试数据尚未生成完毕前就提前调用了入库发布工具。",
    verdict: "违反时序前置依赖约束。静态依赖分析器当场标红并拦截，防止空数据或残缺题目入库发布。",
    roleStory: {
      input: "大模型将「发布入库」排在「测资生成」之前，出现时序颠倒的严重逻辑倒错。",
      defect: "有向无环图（DAG）拓扑检查发现前置依赖尚未就绪，存在时序倒错。",
      defense: "静态门禁当场阻断，生成有向见证路径，精准指导出题人调换正确执行顺序。",
      defectTitle: "DAG 拓扑检查失败，前置依赖未就绪",
      defectTag: "时序倒错 · 拓扑违规",
    },
  },
  case2_dataflow: {
    title: "测资类型与沙箱入参不匹配",
    scenario: "出题流水线中生成器产出的测试用例格式与后续判题沙箱所需输入存在关键字段缺失与类型不兼容。",
    verdict: "数据流绑定检查失败，触发门禁拦截，避免线上学生提交判题时引发沙箱崩溃或批量 RE。",
    roleStory: {
      input: "大模型输出的测资格式是字典对象，但沙箱评测器要求标准纯文本标准输入 (stdin)。",
      defect: "生产者-消费者类型检查发现 Type Mismatch（类型不匹配）。",
      defense: "数据流验证器拦截发布，强制要求在中间添加数据格式转换适配器。",
      defectTitle: "数据流类型不匹配 (Type Mismatch)",
      defectTag: "接口崩溃 · 类型不兼容",
    },
  },
  case3_safety: {
    title: "越权发布：缺少人工审题强制门禁",
    scenario: "大模型直接将自动生成的题目发布入库，整个流程中没有任何人工确认门（Human Gate）。",
    verdict: "违反发布安全策略（MISSING_HUMAN_GATE）。发布门禁强制阻断，必须配置专家审核节点才能放行入库。",
    roleStory: {
      input: "大模型试图实现「全无人值守直接发布」，跳过了任何教师或裁判的人工审核环节。",
      defect: "触发出题系统的安全底线：AI 不能既当出题人又当质检人，必须设防。",
      defense: "安全策略引擎（Safety Engine）一票否决，坚决阻断违规直通发布。",
      defectTitle: "缺少人工审核节点，触发安全红线",
      defectTag: "安全策略 · 缺少审题门",
    },
  },
};

export const ISSUE_TITLE_ZH: Record<string, { title: string; subtitle: string; tag: string }> = {
  "eventually publish_problem": {
    title: "【致命断流】题目未能发布入库 (publish_problem 未执行)",
    subtitle: "流水线在前半段异常中断，导致题目未达入库终态，沦为残缺草稿",
    tag: "执行未竟",
  },
  "if test_generator then human_gate": {
    title: "【轨迹中断】审题门约束未满足",
    subtitle: "审题门仍在图上。轨迹在它之前终止，所以「生成器执行后必须经过审题门」没有被观察到。",
    tag: "轨迹未达",
  },
  "exactly once publish_problem": {
    title: "【幂等缺陷】未达成精准单次入库",
    subtitle: "入库动作在执行轨迹中执行次数为 0，未达成规格要求",
    tag: "未达成",
  },
  "MISSING_HUMAN_GATE": {
    title: "【安全策略】流程缺乏人工审核门禁",
    subtitle: "发布路径上存在无人工审核的旁路，触发出题安全红线",
    tag: "安全红线",
  },
  "OUT_OF_ORDER": {
    title: "【时序颠倒】执行步骤顺序倒置",
    subtitle: "后续依赖步骤在先决条件就绪前被提前触发",
    tag: "时序违规",
  },
  "TYPE_MISMATCH": {
    title: "【数据流异常】输入输出类型不匹配",
    subtitle: "上游产出的数据字段或类型无法被下游沙箱接收",
    tag: "数据流",
  },
};

export function issueDisplayInfo(issue: { title?: string; code?: string; description?: string }) {
  const key = (issue.title || issue.code || "").trim();
  if (ISSUE_TITLE_ZH[key]) return ISSUE_TITLE_ZH[key];
  for (const [k, v] of Object.entries(ISSUE_TITLE_ZH)) {
    if (key.includes(k)) return v;
  }
  return {
    title: issue.title || issue.code || "未分类缺陷",
    subtitle: issue.description || "沙箱监视器捕获到的运行异常",
    tag: "缺陷",
  };
}

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
