import type { VerifySession } from "./api";

function download(filename: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function sessionEvidenceJson(session: VerifySession) {
  return {
    kind: "veriflow_evidence_bundle",
    not_a_formal_proof: true,
    timestamp: new Date().toISOString(),
    run_id: session.run_id ?? null,
    workflow_hash: session.workflow_hash,
    source_requirement: session.spec?.source_nl ?? "",
    spec_compiler: session.spec?.compiler,
    status: session.status,
    gate: session.gate,
    static: {
      status: session.static.status,
      issues: session.static.issues,
      dimensions: session.static.dimensions,
    },
    runtime: {
      status: session.runtime?.status,
      issues: session.runtime?.issues,
    },
    witness: session.static.issues.flatMap((issue) => issue.witness_path || []),
    ai_provenance: session.spec?.compiler_basis ?? session.spec?.compiler,
    latency_ms: session.latency_ms,
  };
}

export function sessionEvidenceMarkdown(session: VerifySession) {
  const pack = sessionEvidenceJson(session);
  const issues = session.static.issues
    .map(
      (issue) =>
        `- ${issue.code} (${issue.severity}): ${issue.title || issue.description}\n  witness: ${(issue.witness_path || []).join(" → ") || "—"}`,
    )
    .join("\n");
  return [
    "# VeriFlow evidence",
    "",
    `- run: ${pack.run_id ?? "unsaved"}`,
    `- hash: ${pack.workflow_hash}`,
    `- status: ${pack.status}`,
    `- gate: ${session.gate.ready}`,
    `- static: ${session.static.status}`,
    `- runtime: ${session.runtime?.status ?? "—"}`,
    "",
    "## Requirement",
    "",
    pack.source_requirement || "(empty)",
    "",
    "## Issues",
    "",
    issues || "(none)",
    "",
    "Secrets are not included. This pack is not a formal proof.",
    "",
  ].join("\n");
}

export function downloadSessionEvidence(session: VerifySession, kind: "json" | "md") {
  if (kind === "json") {
    download("veriflow-evidence.json", JSON.stringify(sessionEvidenceJson(session), null, 2), "application/json");
    return;
  }
  download("veriflow-evidence.md", sessionEvidenceMarkdown(session), "text/markdown");
}
