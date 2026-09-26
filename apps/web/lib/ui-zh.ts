/** User-visible Chinese. Protocol enums PASS/FAIL/READY stay English. */

export const DEMO_TITLE_ZH: Record<string, string> = {
  case4_runtime: "静态全绿 · 动态沙箱断流 (典型案例)",
  case1_order: "缺少审题门 · 生成器直接入库",
  case2_dataflow: "类型不一致 · object 对 string",
  case3_safety: "明文密钥 · 生成器配置写死 api_key",
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
    scenario: "出题流程是：生成器 → 范围守卫 → 支付状态分支（payment_status == success）→ 通知 → 审题门 → 入库。",
    verdict: "静态检查通过，审题门仍在图上。演示在支付状态分支之后截断轨迹（skip_after if_pay），通知和审题门没有被执行，门禁因此 BLOCKED。不是分支条件判断失败，也不是审题门被删掉。",
    roleStory: {
      input: "图上有 6 个节点，静态连线完整，审题门还在。",
      defect: "轨迹在支付状态分支之后终止，通知和审题门没有被执行。",
      defense: "VeriFlow 捕获反例时序切片，门禁判定 BLOCKED，阻止未完备试题污染题库。",
      defectTitle: "静态分析全绿，沙箱捕获致命断流",
      defectTag: "运行时断流 · 捕获最小反例",
    },
  },
  case1_order: {
    title: "生成器直接入库，路径上没有审题门",
    scenario: "图上只有两个节点：生成器 → 入库。顺序没有反，但入库前没有审题门，也没有范围守卫。",
    verdict: "问题列表报的是缺少审题门（MISSING_HUMAN_GATE），以及缺少上界守卫。不是「发布排在生成之前」。",
    roleStory: {
      input: "两个节点按生成器再到入库连接，审题门不在图上。",
      defect: "入库前没有审题门，也没有范围上界守卫。",
      defense: "门禁因缺少审题门拦截。要补的是审题门，不是把这两步对调。",
      defectTitle: "缺少审题门",
      defectTag: "安全策略 · 缺少审题门",
    },
  },
  case2_dataflow: {
    title: "生成器输出 object，守卫要 string",
    scenario: "生成器的 out_type 是 object，下一跳范围守卫的 in_type 是 string。中间没有转换节点。",
    verdict: "数据流检查报类型不一致：gen:object -> g_bounds:string。不是 stdin 格式问题。",
    roleStory: {
      input: "生成器声明输出 object，范围守卫声明输入 string。",
      defect: "检查结果是 gen:object -> g_bounds:string。",
      defense: "门禁因此拦截。要改的是这两端的类型，不是补一个 stdin 适配器。",
      defectTitle: "类型不一致",
      defectTag: "数据流 · object 对 string",
    },
  },
  case3_safety: {
    title: "生成器配置里写了明文密钥",
    scenario: "流程里有范围守卫和专家审题门，然后再入库。生成器的 config.api_key 是明文。",
    verdict: "静态安全检查报硬编码密钥（HARDCODED_SECRET）。审题门还在图上，不是缺少审题门。",
    roleStory: {
      input: "图上有审题门。生成器节点的配置里写了 api_key。",
      defect: "api_key 是明文密钥，安全检查报 HARDCODED_SECRET。",
      defense: "门禁因明文密钥拦截。要改的是配置，不是补审题门。",
      defectTitle: "硬编码密钥",
      defectTag: "安全策略 · 明文密钥",
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
