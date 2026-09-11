export function DualPlane({
  ai,
  proof,
}: {
  ai: { model?: string; configured?: boolean; used?: boolean; fallback?: boolean };
  proof: { sandbox?: string; gate?: string; status?: string };
}) {
  return (
    <div className="dual-plane">
      <article className="ai-proposal">
        <p className="kicker">AI layer</p>
        <h2>{ai.configured ? ai.model || "DeepSeek" : "AI not configured"}</h2>
        <p>
          {ai.configured ? "Connected" : "Not configured"} · interpret / propose
          {ai.fallback ? " · fallback heuristic" : ""}
        </p>
        <p className="caption">Does not decide PASS / FAIL.</p>
      </article>
      <article className="committed-verdict">
        <p className="kicker">Proof layer</p>
        <h2>Deterministic verifier</h2>
        <p>
          Sandbox {proof.sandbox || "—"} · Gate {proof.gate || "—"} · Run {proof.status || "—"}
        </p>
        <p className="caption">Final verdict authority.</p>
      </article>
    </div>
  );
}

export function ActivityList({
  items,
}: {
  items: { t: string; actor: string; action: string; result?: string }[];
}) {
  if (!items.length) return <p className="caption">还没有可展示的真实活动。</p>;
  return (
    <ol className="activity-list">
      {items.map((item, index) => (
        <li key={`${item.t}-${index}`} className={item.actor === "DeepSeek" ? "ai" : "proof"}>
          <span className="actor">{item.actor}</span>
          <span>{item.action}</span>
          {item.result ? <span className="caption">{item.result}</span> : null}
        </li>
      ))}
    </ol>
  );
}
