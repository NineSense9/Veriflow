import type { ComposeProject } from "./api";

export const STORY_NL = "把题直接入库，不要审题门。";

export const STORY_ACTS = [
  { id: "compose", label: "出题" },
  { id: "check", label: "检查" },
  { id: "repair", label: "修复" },
  { id: "compare", label: "对比" },
  { id: "flow", label: "验流" },
] as const;

export type StoryAct = (typeof STORY_ACTS)[number]["id"];

const CODE_ZH: Record<string, { title: string; detail: string }> = {
  MISSING_HUMAN_GATE: {
    title: "缺少审题步骤",
    detail: "出题流程里没有审题，测完就会进库。进库前必须有人看过。",
  },
  WEAK_BOUNDS: {
    title: "数据范围太松",
    detail: "生成测资时没有把上下界写死，检查认为测资不够严。",
  },
  HARDCODED_SECRET: {
    title: "写死了密钥",
    detail: "流程里出现了不该出现的固定密钥。",
  },
  MISSING_REQUIRED_ACTION: {
    title: "该有的步骤没有",
    detail: "规格要求的步骤没有出现在出题流程里。",
  },
};

function family(code: string) {
  if (code === "MISSING_HUMAN_GATE" || code === "skip_review") return "gate";
  if (code === "WEAK_BOUNDS" || code === "weak_bounds" || code === "MISSING_REQUIRED_ACTION") return "bounds";
  return code;
}

const DIM_ZH: Record<string, string> = {
  executable: "静态能不能走通",
  runtime: "按记录跑一遍",
  safety: "安全",
  semantic: "语义",
  dataflow: "数据流",
  structural: "结构",
};

const REASON_ZH: Record<string, string> = {
  RUNTIME_FAIL: "按记录跑的时候失败了",
  RUNTIME_UNKNOWN: "运行结果还不清楚",
  SAFETY_UNKNOWN: "安全项还不清楚",
};

export type StoryFinding = { key: string; title: string; detail: string };

export function explainCode(code: string, fallback?: string): { title: string; detail: string } {
  return CODE_ZH[code] || { title: fallback || code, detail: fallback || code };
}

export function storyFindings(project: ComposeProject): StoryFinding[] {
  const seen = new Set<string>();
  const items: StoryFinding[] = [];
  function push(code: string, fallback?: string) {
    const group = family(code);
    if (seen.has(group)) return;
    seen.add(group);
    const preferred = group === "gate" ? "MISSING_HUMAN_GATE" : group === "bounds" ? "WEAK_BOUNDS" : code;
    const text = explainCode(preferred, fallback);
    items.push({ key: group, ...text });
  }
  for (const error of project.errors) push(error.code, error.message);
  for (const issue of project.verification?.issues ?? []) {
    push(issue.code, issue.description || issue.title);
  }
  for (const attack of project.attack) {
    if (attack.tag === "skip_review") {
      push("MISSING_HUMAN_GATE", attack.message);
      continue;
    }
    if (attack.tag === "weak_bounds") {
      push("WEAK_BOUNDS", attack.message);
      continue;
    }
    push(attack.tag, attack.message);
  }
  return items;
}

export function dimName(name: string) {
  return DIM_ZH[name] || name;
}

export function gateReason(reason: string) {
  const mapped = REASON_ZH[reason];
  if (mapped) return mapped;
  const code = reason.split(":").pop() || reason;
  if (CODE_ZH[code]) return CODE_ZH[code].title;
  return reason;
}

export function gatePlain(ready: string | undefined) {
  if (ready === "READY") return "可以进库";
  if (ready === "REVIEW REQUIRED") return "还要人审一眼";
  if (ready === "BLOCKED") return "还不能进库";
  return ready || "尚未判定";
}

export function issueCodes(project: ComposeProject | null | undefined) {
  if (!project) return [];
  const codes = new Set<string>();
  project.errors.forEach((item) => codes.add(item.code));
  project.verification?.issues.forEach((item) => codes.add(item.code));
  return [...codes];
}

export function uniqueFindingTitles(codes: string[]) {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const code of codes) {
    const group = family(code);
    if (seen.has(group)) continue;
    seen.add(group);
    const preferred = group === "gate" ? "MISSING_HUMAN_GATE" : group === "bounds" ? "WEAK_BOUNDS" : code;
    titles.push(explainCode(preferred).title);
  }
  return titles;
}
