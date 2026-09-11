export const DIM_META: Record<string, { label: string; hint: string }> = {
  structural: { label: "结构", hint: "连通、无环、孤立节点、出口覆盖" },
  semantic: { label: "语义", hint: "必要动作、触发、顺序是否对齐需求" },
  dataflow: { label: "数据流", hint: "绑定、类型、缺失参数" },
  executable: { label: "静态可达", hint: "从图结构判断节点能否被走到。不是模拟运行。" },
  safety: { label: "安全", hint: "密钥、webhook、策略风险" },
  runtime: { label: "运行时模拟", hint: "Mock trace 的时序与约束监视。与静态可达独立。" },
};

export function dimLabel(name: string) {
  return DIM_META[name]?.label ?? name;
}

export function dimHint(name: string) {
  return DIM_META[name]?.hint ?? "";
}

export type ChipTone = "AC" | "WA" | "TLE" | "CE";

export function tone(status: string | null | undefined): ChipTone {
  const value = (status || "").toUpperCase();
  if (["PASS", "READY", "MATCH", "AC", "APPLIED", "IMPROVED", "TRUE", "COVERED"].includes(value)) return "AC";
  if (
    [
      "WARNING",
      "UNKNOWN",
      "NOT_RUN",
      "NOT_APPLICABLE",
      "REVIEW REQUIRED",
      "REVIEW",
      "QUEUED",
      "RUNNING",
      "SUGGESTED",
      "NOT_APPLIED",
      "AMBIGUOUS",
      "UNMAPPED",
    ].includes(value)
  ) {
    return "TLE";
  }
  return "WA";
}

export function gateWhy(executable: string | undefined, runtime: string | undefined, ready: string | undefined) {
  if (executable === "PASS" && runtime === "FAIL") {
    return "静态可达满足，但运行时模拟失败。Gate 以运行时为准（RUNTIME_FAIL → BLOCKED）。";
  }
  if (ready === "BLOCKED") return "存在阻断条件。见 Gate reasons。";
  if (ready === "REVIEW REQUIRED") return "存在 UNKNOWN，需人工审题。";
  if (ready === "READY") return "静态与运行时均未阻断，可以入库。";
  return "";
}
