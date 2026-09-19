"use client";

import { statusLabel } from "@/lib/ui-zh";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CASE4_STEPS, case4Gate, case4IssueTitle, case4Witness, type Case4Demo } from "@/lib/case4-demo";
import { useEffects } from "@/lib/effects";

export default function VerificationMiniFlow() {
  const { effects } = useEffects();
  const motion = effects === "full" || effects === "balanced";
  const [demo, setDemo] = useState<Case4Demo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .demo("case4_runtime")
      .then((payload) =>
        setDemo({
          id: payload.id,
          title: payload.title,
          nl: payload.nl,
          skip_after: payload.skip_after,
          expect_static: payload.expect_static,
          expect_runtime: payload.expect_runtime,
          expect_gate: payload.expect_gate,
          expect_pattern: payload.expect_pattern,
          story: payload.story,
          issue: payload.issue,
          witness: payload.witness,
        }),
      )
      .catch((err: Error) => setError(err.message || "案例 4 加载失败"));
  }, []);

  const gate = demo ? case4Gate(demo) : "";

  return (
    <aside className={`vf-miniflow${motion ? " vf-miniflow-live" : ""}`} aria-label="案例 4 验证流程">
      <p className="vf-home-kicker">案例 4</p>
      <ol>
        {CASE4_STEPS.map((step, index) => (
          <li key={step.id} data-role={step.role} data-step={step.id}>
            {index ? <span className="vf-miniflow-arrow" aria-hidden="true" /> : null}
            <span className="vf-miniflow-label">{step.label}</span>
            {step.role === "ai" ? <em>AI 提案</em> : null}
            {step.role === "verifier" ? <em>确定性验证</em> : null}
            {step.id === "static" && demo ? (
              <strong className={demo.expect_static === "PASS" ? "ok" : "bad"}>{statusLabel(demo.expect_static)}</strong>
            ) : null}
            {step.id === "runtime" && demo ? (
              <strong className={demo.expect_runtime === "PASS" ? "ok" : "bad"}>{statusLabel(demo.expect_runtime)}</strong>
            ) : null}
            {step.id === "gate" && demo ? (
              <strong className={gate === "READY" ? "ok" : gate === "BLOCKED" ? "bad" : "ghost"}>{statusLabel(gate)}</strong>
            ) : null}
          </li>
        ))}
      </ol>
      {error ? <p className="err">{error}</p> : null}
      {demo ? (
        <div className="vf-miniflow-finding">
          <p>
            <span className="verdict WA">{statusLabel(demo.issue?.severity || "HIGH")}</span> {case4IssueTitle(demo)}
          </p>
          <p className="mono">{demo.issue?.code}</p>
          <p className="caption">最小见证 {case4Witness(demo)}</p>
        </div>
      ) : (
        <p className="ghost">读取案例 4…</p>
      )}
    </aside>
  );
}
