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

function aiProvenance(session: VerifySession) {
  const trace = session.ai_trace;
  if (!trace) {
    return {
      provider: null,
      model: null,
      used: null,
      requested: null,
      fallback_reason: null,
      prompt_version: null,
      compiler_basis: session.spec?.compiler_basis ?? null,
      status: "unavailable",
    };
  }
  return {
    provider: trace.provider ?? null,
    model: trace.model ?? null,
    used: trace.used,
    requested: trace.requested,
    fallback_reason: trace.fallback_reason ?? null,
    prompt_version: trace.prompt_version ?? null,
    status: trace.status,
    compiler_basis: session.spec?.compiler_basis ?? null,
  };
}

export function sessionEvidenceJson(session: VerifySession) {
  const runtimeIssues = (session.runtime_findings ?? session.runtime?.issues ?? []) as {
    code?: string;
    title?: string;
    description?: string;
    constraint_id?: string;
    expected?: string;
    observed?: string;
    witness_path?: string[];
    affected_nodes?: string[];
  }[];
  const runtimeWitness = runtimeIssues.flatMap((issue) => issue.witness_path || issue.affected_nodes || []);
  return {
    kind: "veriflow_evidence_bundle",
    not_a_formal_proof: true,
    timestamp: session.created_at || new Date().toISOString(),
    run_id: session.run_id ?? null,
    workflow_hash: session.workflow_hash,
    source_requirement: session.spec?.source_nl ?? "",
    spec: {
      compiler: session.spec?.compiler ?? null,
      compiler_basis: session.spec?.compiler_basis ?? null,
      goal: session.spec?.goal ?? null,
      constraints: session.spec?.source_traces ?? null,
    },
    status: session.status,
    gate: session.gate,
    static: {
      status: session.static.status,
      issues: session.static.issues,
      dimensions: session.static.dimensions,
      witness: session.static.issues.flatMap((issue) => issue.witness_path || []),
    },
    runtime: {
      status: session.runtime?.status ?? null,
      issues: runtimeIssues,
      witness: runtimeWitness.length ? runtimeWitness : null,
      trace: session.trace ?? null,
    },
    repair: session.repair
      ? {
          improved: session.repair.improved,
          iterations: session.repair.iterations,
          final_decision: session.repair.final_decision ?? null,
          selected_candidate_id: session.repair.selected_candidate_id ?? null,
        }
      : null,
    ai_provenance: aiProvenance(session),
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
  const runtime = (pack.runtime.issues || [])
    .map((issue) => {
      const row = issue as {
        code?: string;
        title?: string;
        description?: string;
        constraint_id?: string;
        expected?: string;
        observed?: string;
      };
      return `- ${row.code || row.constraint_id || "runtime"}: ${row.title || row.description || row.expected || row.observed || ""}`;
    })
    .join("\n");
  const ai = pack.ai_provenance;
  return [
    "# VeriFlow evidence",
    "",
    `- run: ${pack.run_id ?? "unsaved"}`,
    `- hash: ${pack.workflow_hash}`,
    `- timestamp: ${pack.timestamp}`,
    `- status: ${pack.status}`,
    `- gate: ${session.gate.ready}`,
    `- static: ${session.static.status}`,
    `- runtime: ${session.runtime?.status ?? "—"}`,
    "",
    "## Requirement",
    "",
    pack.source_requirement || "(empty)",
    "",
    "## Static issues",
    "",
    issues || "(none)",
    "",
    "## Runtime issues",
    "",
    runtime || "(none)",
    "",
    "## AI provenance",
    "",
    `- provider: ${ai.provider ?? "unavailable"}`,
    `- model: ${ai.model ?? "unavailable"}`,
    `- used: ${ai.used ?? "unavailable"}`,
    `- requested: ${ai.requested ?? "unavailable"}`,
    `- prompt_version: ${ai.prompt_version ?? "unavailable"}`,
    `- fallback_reason: ${ai.fallback_reason ?? "unavailable"}`,
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
