export type ProblemListItem = {
  id: string;
  title: string;
  difficulty: number;
  tags: string[];
  ac_rate: number | null;
  hidden_ac_rate: number | null;
  kill_rate: number | null;
};

export type PublicTest = {
  name: string;
  stdin: string;
  stdout: string;
};

export type ProblemDetail = {
  id: string;
  title: string;
  statement: string;
  difficulty: number;
  tags: string[];
  spec: {
    time_limit_ms: number;
    memory_limit_mb: number;
    languages: string[];
    signature?: { input: string; output: string };
  };
  has_brute?: boolean;
  has_gen?: boolean;
  public_tests: PublicTest[];
};

export type StressKit = {
  id: string;
  title: string;
  has_brute: boolean;
  has_gen: boolean;
  gen_source: string | null;
  brute_source: string | null;
  time_limit_ms: number;
  memory_limit_mb: number;
};

export type WorkflowIR = {
  ir_version: string;
  domain: string;
  name: string;
  nodes: {
    id: string;
    kind: string;
    tool?: string | null;
    expr?: string | null;
    on_fail?: string | null;
    assignee_role?: string | null;
  }[];
  edges: { from: string; to: string }[];
};

export type ComposeError = { code: string; message: string; node_id?: string | null };
export type ComposeAttack = { tag: string; message: string; node_id?: string };

export type VerifyIssue = {
  id: string;
  category: string;
  severity: string;
  code: string;
  title: string;
  description: string;
  requirement?: string | null;
  affected_nodes: string[];
  witness_path: string[];
  expected?: string | null;
  actual?: string | null;
  repair_hint?: string | null;
  verification_method?: string;
  detected_by?: string;
  algorithm_version?: string;
  evidence_source?: string;
  minimized_nodes?: string[];
  root_cause_id?: string | null;
  constraint_id?: string | null;
};

export type ConstraintVerdict = {
  constraint_id: string;
  constraint_type: string;
  status: string;
  verification_method: string;
  description?: string;
  expected?: string | null;
  actual?: string | null;
  affected_nodes?: string[];
  witness_path?: string[];
};

export type Verification = {
  status: string;
  risk_level: string;
  confidence: number;
  issues: VerifyIssue[];
  requirements_passed: number;
  requirements_total: number;
  dimensions: { name: string; status: string; issue_count: number }[];
  constraints?: ConstraintVerdict[];
  constraints_passed?: number;
  constraints_failed?: number;
  constraints_unknown?: number;
  root_causes?: { id: string; summary: string; derived_codes: string[] }[];
};

export type AlgorithmRecord = {
  algorithm_id: string;
  name: string;
  version: string;
  category: string;
  description: string;
  deterministic: boolean;
  kind: string;
  inputs: string[];
  outputs: string[];
  complexity: string;
  code_location: string;
  steps: string[];
  used_by: string[];
  tests: string[];
  limitations: string;
  example: string;
  benchmark_metrics: Record<string, unknown>;
};

export type VerifySession = {
  run_id?: number;
  parent_run_id?: number;
  status: string;
  latency_ms: number;
  spec: {
    goal?: string;
    compiler?: string;
    source_nl?: string;
    compiler_basis?: string;
    source_traces?: { constraint_id: string; start: number | null; end: number | null; snippet: string; kind: string }[];
  };
  ir: WorkflowIR;
  static: Verification;
  runtime: ComposeProject["runtime"];
  trace: ComposeProject["trace"];
  alignment: {
    alignment: { expected: string | null; observed: string | null; kind: string; evidence: string }[];
    alignment_cost: number;
    sequential_edit_distance: number;
    deviation_count: number;
    minimal_deviation: { expected: string | null; observed: string | null; kind: string }[];
    expected_sequence: string[];
    observed_sequence: string[];
    algorithm_id: string;
    algorithm_version: string;
    limitations: string;
  };
  cross: { pattern: string; story: string; static_status: string; runtime_status: string };
  gate: NonNullable<ComposeProject["gate"]>;
  matrix: {
    columns: string[];
    rows: {
      constraint_id: string;
      requirement: string;
      constraint_type: string;
      cells: Record<string, { status: string; evidence: string; algorithm_id: string }>;
    }[];
  };
  pipeline: {
    id: string;
    name: string;
    status: string;
    latency_ms: number;
    algorithm_id: string;
    kind: string;
    checks_executed: number;
    cache_status: string;
    input_summary: string;
    output_summary: string;
    evidence: string[];
  }[];
  minimized: { issue_id: string; original_node_count: number; minimized_nodes: string[]; witness_path: string[]; globally_minimal: boolean }[];
  node_coverage: { fully_supported: string[]; partially_supported: string[]; unknown: string[]; coverage: number };
  workflow_hash: string;
  created_at: string;
  graph?: {
    run_id: string;
    entities: { id: string; type: string; label: string; metadata?: Record<string, unknown> }[];
    relations: { source_id: string; target_id: string; relation_type: string; evidence?: string }[];
  };
  ambiguity?: { status: string; method: string; items: { ambiguity_id: string; status: string; reason: string; snippet: string; suggested_clarification: string }[] };
  runtime_findings?: VerifyIssue[];
  traceability?: {
    covered: number;
    failed: number;
    ambiguous: number;
    unmapped: number;
    clauses: {
      id: string;
      text: string;
      kind: string;
      status: string;
      constraint_id: string;
      nodes: string[];
      verifier: string;
      evidence: string;
      snippet: string;
    }[];
  };
};

export type RepairPatch = {
  operation: string;
  source?: string | null;
  target?: string | null;
  node_id?: string | null;
  reason?: string;
};

export type AIInvocationTrace = {
  stage: "nl_ir" | "repair";
  requested: boolean;
  used: boolean;
  provider?: string | null;
  model?: string | null;
  status: "SUCCESS" | "FALLBACK" | "NOT_USED" | "ERROR" | "UNKNOWN";
  latency_ms?: number | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  retries?: number;
  request_id?: string | null;
  fallback_reason?: string | null;
  prompt_version?: string | null;
};

export type RepairCandidate = {
  id: string;
  source: "rule" | "deepseek";
  model?: string | null;
  prompt_version?: string | null;
  target_issue_id?: string | null;
  rationale?: string;
  patches: RepairPatch[];
  llm_latency_ms?: number | null;
  fallback_reason?: string | null;
};

export type GuardStageResult = {
  name: string;
  status: "PASS" | "FAIL" | "SKIPPED";
  reason?: string;
  latency_ms?: number | null;
};

export type CandidateEvaluation = {
  candidate_id: string;
  stages: GuardStageResult[];
  accepted: boolean;
  reject_reason?: string | null;
};

export type ComposeProject = {
  id: number;
  source_nl: string;
  ir: WorkflowIR | null;
  errors: ComposeError[];
  attack: ComposeAttack[];
  gate_status: string;
  status: string;
  published_problem_id: string | null;
  compiler: string | null;
  updated_at: string;
  ai_trace?: AIInvocationTrace;
  spec?: { goal: string; compiler: string };
  verification?: Verification;
  gate?: {
    ready: string;
    exit_code: number;
    static_status: string;
    runtime_status: string;
    reasons: string[];
    issue_count?: number;
    high_severity?: number;
    requirements_passed?: number;
    requirements_total?: number;
    runtime_coverage?: number | null;
    cross_pattern?: string | null;
    dimensions?: Record<string, string>;
  };
  runtime?: {
    status: string;
    issues: {
      constraint_id: string;
      status: string;
      expected: string;
      observed: string;
      violation_index?: number | null;
      trace_slice?: number[];
      affected_nodes?: string[];
      counterexample?: { slice_labels?: string[]; expected_predecessor?: string | null; actual_predecessor?: string | null };
    }[];
    constraint_runtime_coverage?: number;
    node_coverage?: number;
    required_action_coverage?: number;
    branch_coverage?: number;
    verifiable?: number;
    total?: number;
  };
  trace?: {
    events: {
      event_index: number;
      node_id: string;
      operation: string;
      status: string;
      duration_ms: number;
      branch?: string | null;
      external_effect?: string | null;
    }[];
  };
  cross?: { pattern: string; story: string };
  repair?: {
    improved: boolean;
    iterations: number;
    patch_operations?: number;
    changed_nodes?: number;
    regression_rate?: number;
    impact_nodes?: string[];
    reevaluated_constraints?: number;
    total_constraints?: number;
    used_full_fallback?: boolean;
    candidates_generated?: number;
    candidates_rejected_guard?: number;
    candidates_rejected_incremental?: number;
    candidates_fully_verified?: number;
    selected_candidate_id?: string | null;
    final_decision?: string;
    candidates?: RepairCandidate[];
    evaluations?: CandidateEvaluation[];
    ai_trace?: AIInvocationTrace | null;
    steps: {
      iteration: number;
      accepted: boolean;
      reason: string;
      patches: RepairPatch[];
      candidates_evaluated?: number;
    }[];
    initial: Verification;
    final: Verification;
  };
};

export type ComposeSummary = {
  id: number;
  source_nl: string;
  status: string;
  gate_status: string;
  published_problem_id: string | null;
  updated_at: string;
};

export type StressResult = {
  status: string;
  rounds_ran: number;
  time_ms: number;
  sandbox: string;
  counterexample: Counterexample | null;
  compile_log: string | null;
  detail: string | null;
  failed_role: string | null;
  log: { round: number; status: string; role?: string }[];
};

export type Counterexample = {
  stdin: string;
  expected: string;
  actual: string;
  source: string;
  name?: string;
  verdict?: string;
};

export type SubmitResult = {
  job_id: string;
  submission_id: number;
  verdict: string;
  stage: string;
  time_ms: number;
  counterexample: Counterexample | null;
  sandbox: string;
};

export type SubmissionRow = {
  id: number;
  problem_id: string;
  lang: string;
  verdict: string | null;
  time_ms: number | null;
  created_at: string;
};

function token(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("vf_token");
}

export function currentUsername(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("vf_user");
}

export function setSession(username: string, accessToken: string) {
  sessionStorage.setItem("vf_token", accessToken);
  sessionStorage.setItem("vf_user", username);
}

export function clearSession() {
  sessionStorage.removeItem("vf_token");
  sessionStorage.removeItem("vf_user");
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const access = token();
  if (access) headers.set("Authorization", `Bearer ${access}`);
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
  if (response.status === 401) {
    const error = new Error("unauthenticated") as Error & { status: number };
    error.status = 401;
    throw error;
  }
  if (!response.ok) {
    let message = `http_${response.status}`;
    try {
      const body = (await response.json()) as { detail?: { message?: string } | string };
      if (typeof body.detail === "string") message = body.detail;
      else if (body.detail?.message) message = body.detail.message;
    } catch {
      /* keep fallback */
    }
    const error = new Error(message) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return (await response.json()) as T;
}

export const api = {
  health: () =>
    request<{
      ok: boolean;
      sandbox: string;
      ai?: { provider: string; model: string; configured: boolean };
    }>("/api/health"),
  login: (username: string, password: string) =>
    request<{ token: string; username: string; role: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<{ username: string; role: string }>("/api/auth/me"),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  problems: () => request<{ problems: ProblemListItem[] }>("/api/problems"),
  problem: (id: string) => request<ProblemDetail>(`/api/problems/${id}`),
  submit: (id: string, lang: "python3" | "cpp17", source: string) =>
    request<SubmitResult>(`/api/problems/${id}/submit`, {
      method: "POST",
      body: JSON.stringify({ lang, source }),
    }),
  solve: (id: string, lang: "python3" | "cpp17") =>
    request<SubmitResult & { source: string; solver: string }>(`/api/problems/${id}/solve`, {
      method: "POST",
      body: JSON.stringify({ lang }),
    }),
  submissions: () => request<{ submissions: SubmissionRow[] }>("/api/submissions"),
  tutor: (problemId: string, submissionId: number) =>
    request<{ question: string; backend: string; spoiler_rejects: number }>(
      `/api/problems/${problemId}/tutor`,
      {
        method: "POST",
        body: JSON.stringify({ submission_id: submissionId }),
      },
    ),
  kit: (id: string) => request<StressKit>(`/api/problems/${id}/kit`),
  version: () =>
    request<{ git_commit: string | null; build_time: string | null; app_version: string; verifier_version: string }>(
      "/api/version",
    ),
  composeCreate: (nl: string, allow_ai = true) =>
    request<ComposeProject>("/api/compose", {
      method: "POST",
      body: JSON.stringify({ nl, allow_ai }),
    }),
  composeExample: (name: string) =>
    request<ComposeProject>("/api/compose/example", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  composeList: () => request<{ projects: ComposeSummary[] }>("/api/compose"),
  composeGet: (id: number) => request<ComposeProject>(`/api/compose/${id}`),
  composeSaveIr: (id: number, ir: WorkflowIR) =>
    request<ComposeProject>(`/api/compose/${id}/ir`, {
      method: "POST",
      body: JSON.stringify({ ir }),
    }),
  composeRepair: (id: number, nl: string, allow_ai = true) =>
    request<ComposeProject>(`/api/compose/${id}/repair`, {
      method: "POST",
      body: JSON.stringify({ nl, allow_ai }),
    }),
  composeGate: (id: number, decision: "approved" | "rejected") =>
    request<ComposeProject>(`/api/compose/${id}/gate`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
  composePublish: (id: number) =>
    request<ComposeProject>(`/api/compose/${id}/publish`, { method: "POST" }),
  composeVerifyRepair: (id: number, allow_ai = true) =>
    request<ComposeProject>(`/api/compose/${id}/verify-repair`, {
      method: "POST",
      body: JSON.stringify({ allow_ai }),
    }),
  runtime: (ir: WorkflowIR, nl: string, skipAfter?: string) =>
    request<{
      trace: ComposeProject["trace"];
      runtime: ComposeProject["runtime"];
      cross: ComposeProject["cross"];
    }>("/api/runtime", {
      method: "POST",
      body: JSON.stringify({ ir, nl, skip_after: skipAfter || null }),
    }),
  sets: () =>
    request<{
      sets: { id: string; title: string; ids: string[]; problems: { id: string; title: string }[] }[];
    }>("/api/sets"),
  report: () => request<Record<string, number | null>>("/api/report/summary"),
  demos: () => request<{ demos: { id: string; title: string; kind: string }[] }>("/api/demos"),
  reportSession: (body: { demo?: string; ir?: WorkflowIR; nl?: string; skip_after?: string | null; parent_run_id?: number }) =>
    request<VerifySession>("/api/report/session", { method: "POST", body: JSON.stringify(body) }),
  reportRun: (id: number) => request<VerifySession>(`/api/report/runs/${id}`),
  benchLatest: () => request<Record<string, unknown>>("/api/bench/latest"),
  reportExport: (body: { demo?: string; ir?: WorkflowIR; nl?: string; skip_after?: string | null }) =>
    request<{ markdown: string; json: Record<string, unknown> }>("/api/report/export", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  reportHistory: (limit = 20) =>
    request<{
      runs: {
        id: number;
        created_at: string;
        workflow_name: string;
        workflow_hash: string;
        status: string;
        issue_count: number;
        issue_static?: number;
        issue_runtime?: number;
        parent_run_id?: number;
        coverage: number;
        runtime_status: string;
        gate_ready: string;
        latency_ms: number;
      }[];
    }>(`/api/report/history?limit=${Math.min(Math.max(limit, 1), 100)}`),
  reportCompare: (left_id: number, right_id: number) =>
    request<{
      resolved: string[];
      new: string[];
      unchanged: string[];
      left_status: string;
      right_status: string;
      left_gate: string;
      right_gate: string;
      runtime: { left: string; right: string };
      latency_ms: { left: number; right: number };
    }>("/api/report/compare", { method: "POST", body: JSON.stringify({ left_id, right_id }) }),
  algorithms: () =>
    request<{
      algorithms: AlgorithmRecord[];
      count: number;
      deterministic: number;
      ai_assisted: number;
      benchmark_version: string | null;
    }>("/api/algorithms"),
  algorithm: (id: string) => request<AlgorithmRecord>(`/api/algorithms/${id}`),
  algorithmTry: (id: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/api/algorithms/${id}/try`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  verifyRepair: (ir: WorkflowIR, nl: string, allow_ai = true) =>
    request<{
      ir: WorkflowIR;
      improved: boolean;
      iterations: number;
      patch_operations?: number;
      changed_nodes?: number;
      changed_edges?: number;
      candidates_generated?: number;
      candidates_rejected_guard?: number;
      candidates_rejected_incremental?: number;
      candidates_fully_verified?: number;
      used_full_fallback?: boolean;
      reevaluated_constraints?: number;
      total_constraints?: number;
      affected_verifiers?: string[];
      impact_reason?: string;
      selected_candidate?: string;
      selected_candidate_id?: string | null;
      final_decision?: string;
      candidates?: RepairCandidate[];
      evaluations?: CandidateEvaluation[];
      ai_trace?: AIInvocationTrace | null;
      final: Verification;
      initial: Verification;
      steps: { iteration: number; accepted: boolean; reason: string; patches: RepairPatch[]; candidates_evaluated?: number }[];
    }>("/api/verify-repair", { method: "POST", body: JSON.stringify({ ir, nl, max_iterations: 3, allow_ai }) }),
  mutate: (id: string) => request<{ problem_id: string; kill_rate: number | null }>(`/api/problems/${id}/mutate`, { method: "POST" }),
  stress: (
    id: string,
    body: {
      sol_lang: "python3" | "cpp17";
      sol_source: string;
      gen_lang?: "python3" | "cpp17";
      gen_source?: string;
      brute_lang?: "python3" | "cpp17";
      brute_source?: string;
      rounds: number;
    },
  ) =>
    request<StressResult>(`/api/problems/${id}/stress`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export function unwrapBench(data: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!data) return null;
  const nested = data.metrics;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...data, ...(nested as Record<string, unknown>) };
  }
  return data;
}

export const PYTHON_STUB = `n = int(input())
a = list(map(int, input().split()))
print()
`;

export const CPP_STUB = `#include <iostream>
using namespace std;

int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);
  int n;
  cin >> n;
  return 0;
}
`;
