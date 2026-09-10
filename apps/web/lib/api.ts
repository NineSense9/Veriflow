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
  health: () => request<{ ok: boolean; sandbox: string }>("/api/health"),
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
  composeCreate: (nl: string) =>
    request<ComposeProject>("/api/compose", {
      method: "POST",
      body: JSON.stringify({ nl }),
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
  composeRepair: (id: number, nl: string) =>
    request<ComposeProject>(`/api/compose/${id}/repair`, {
      method: "POST",
      body: JSON.stringify({ nl }),
    }),
  composeGate: (id: number, decision: "approved" | "rejected") =>
    request<ComposeProject>(`/api/compose/${id}/gate`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
  composePublish: (id: number) =>
    request<ComposeProject>(`/api/compose/${id}/publish`, { method: "POST" }),
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
