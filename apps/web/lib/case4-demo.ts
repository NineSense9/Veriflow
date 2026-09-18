export type Case4Demo = {
  id: string;
  title: string;
  nl: string;
  skip_after?: string | null;
  expect_static?: string;
  expect_runtime?: string;
  expect_pattern?: string;
  story?: string;
  issue?: { code?: string; severity?: string; title?: string };
  witness?: string[];
};

export const CASE4_STEPS = [
  { id: "requirement", label: "Requirement", role: "input" as const },
  { id: "ai", label: "AI Draft", role: "ai" as const },
  { id: "spec", label: "WorkflowSpec", role: "verifier" as const },
  { id: "static", label: "Static Verify", role: "verifier" as const },
  { id: "runtime", label: "Runtime Trace", role: "verifier" as const },
  { id: "gate", label: "Gate", role: "verifier" as const },
];

export function case4IssueTitle(demo: Case4Demo) {
  return demo.issue?.title || demo.story || "";
}

export function case4Witness(demo: Case4Demo) {
  return demo.witness?.length ? demo.witness.join(" → ") : "";
}
