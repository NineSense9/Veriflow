export type AmbientVariant =
  | "faulty-terminal"
  | "light-rays"
  | "floating-lines"
  | "threads"
  | "topography"
  | "scanner-field"
  | "ripple-grid"
  | "none";

export type AmbientConfig = {
  variant: AmbientVariant;
  intensity: number;
  pointer: boolean;
};

type Rule = { test: (path: string) => boolean; config: AmbientConfig };

const RULES: Rule[] = [
  { test: (p) => p === "/login" || p.startsWith("/login/"), config: { variant: "light-rays", intensity: 0.7, pointer: false } },
  { test: (p) => p === "/", config: { variant: "faulty-terminal", intensity: 0.8, pointer: true } },
  { test: (p) => p === "/compose" || p.startsWith("/compose/"), config: { variant: "floating-lines", intensity: 0.35, pointer: true } },
  { test: (p) => p === "/report" || p.startsWith("/report/"), config: { variant: "scanner-field", intensity: 0.16, pointer: false } },
  { test: (p) => p === "/evidence" || p.startsWith("/evidence/"), config: { variant: "topography", intensity: 0.26, pointer: false } },
  { test: (p) => p === "/architecture" || p.startsWith("/architecture/"), config: { variant: "threads", intensity: 0.38, pointer: true } },
  { test: (p) => p === "/algorithms" || p.startsWith("/algorithms/"), config: { variant: "ripple-grid", intensity: 0.2, pointer: true } },
  { test: (p) => p === "/benchmark" || p.startsWith("/benchmark/"), config: { variant: "ripple-grid", intensity: 0.12, pointer: false } },
  { test: (p) => p === "/stress" || p.startsWith("/stress/"), config: { variant: "scanner-field", intensity: 0.1, pointer: false } },
];

export function resolveAmbient(pathname: string): AmbientConfig {
  const path = pathname || "/";
  for (const rule of RULES) {
    if (rule.test(path)) return { ...rule.config };
  }
  return { variant: "none", intensity: 0, pointer: false };
}

export function selftestAmbient(): string[] {
  const expect: [string, AmbientVariant][] = [
    ["/", "faulty-terminal"],
    ["/login", "light-rays"],
    ["/compose", "floating-lines"],
    ["/compose/12", "floating-lines"],
    ["/report", "scanner-field"],
    ["/report/runs/3", "scanner-field"],
    ["/evidence", "topography"],
    ["/architecture", "threads"],
    ["/algorithms", "ripple-grid"],
    ["/benchmark", "ripple-grid"],
    ["/stress", "scanner-field"],
    ["/settings", "none"],
    ["/history", "none"],
    ["/problems", "none"],
    ["/status", "none"],
    ["/sets", "none"],
  ];
  const failures: string[] = [];
  for (const [path, variant] of expect) {
    const got = resolveAmbient(path).variant;
    if (got !== variant) failures.push(`${path} expected ${variant} got ${got}`);
  }
  return failures;
}
