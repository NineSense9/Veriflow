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
        <p className="kicker">AI 层</p>
        <h2>{ai.configured ? ai.model || "DeepSeek" : "未配置模型"}</h2>
        <p>
          {ai.configured ? "已配置" : "未配置"} · 解释 / 提案
          {ai.fallback ? " · 回退启发式" : ""}
        </p>
        <p className="caption">不决定通过或失败。</p>
      </article>
      <article className="committed-verdict">
        <p className="kicker">判定层</p>
        <h2>确定性验证器</h2>
        <p>
          沙箱 {proof.sandbox || "—"} · 门禁 {proof.gate === "deterministic" ? "确定性裁决" : proof.gate || "—"} · 判定 {proof.status === "authority" ? "验证器负责" : proof.status || "—"}
        </p>
        <p className="caption">最终判定权在验证器。</p>
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
