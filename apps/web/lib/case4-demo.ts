export type Case4Demo = {
  id: string;
  title: string;
  nl: string;
  skip_after?: string | null;
  expect_static?: string;
  expect_runtime?: string;
  expect_gate?: string;
  expect_pattern?: string;
  story?: string;
  issue?: { code?: string; severity?: string; title?: string };
  witness?: string[];
};

export const CASE4_STEPS = [
  { id: "requirement", label: "需求", role: "input" as const },
  { id: "ai", label: "AI 草案", role: "ai" as const },
  { id: "spec", label: "工作流规格", role: "verifier" as const },
  { id: "static", label: "静态验证", role: "verifier" as const },
  { id: "runtime", label: "运行轨迹", role: "verifier" as const },
  { id: "gate", label: "发布门禁", role: "verifier" as const },
];

export function case4Gate(demo: Case4Demo) {
  return demo.expect_gate || "UNKNOWN";
}

export function case4IssueTitle(demo: Case4Demo) {
  return demo.issue?.title || demo.story || "";
}

export function case4Witness(demo: Case4Demo) {
  return demo.witness?.length ? demo.witness.join(" → ") : "";
}
