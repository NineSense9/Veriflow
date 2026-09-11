"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api, ComposeSummary } from "@/lib/api";
import { useEffects } from "@/lib/effects";

const EXAMPLES = [
  { name: "missing_gate", label: "缺审题门" },
  { name: "missing_bounds", label: "缺范围守卫" },
  { name: "valid_lis", label: "完整出题图" },
];

export default function ComposeIndexPage() {
  const router = useRouter();
  const [nl, setNl] = useState("把题直接入库，不要审题门。");
  const [rows, setRows] = useState<ComposeSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const { prefs } = useEffects();
  const [phase, setPhase] = useState("");

  function refresh() {
    api
      .composeList()
      .then((data) => setRows(data.projects))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function compile() {
    setBusy(true);
    setError("");
    try {
      setPhase(prefs.aiInterpret ? "AI workflow proposal requested" : "Heuristic compile (allow_ai=false)");
      const project = await api.composeCreate(nl, prefs.aiInterpret);
      router.push(`/compose/${project.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadExample(name: string) {
    setBusy(true);
    setError("");
    try {
      const project = await api.composeExample(name);
      router.push(`/compose/${project.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <main className="page wide">
        <header className="page-head">
          <h1>需求编译</h1>
          <p className="lead">
            Natural Language → Spec。编译器只负责解释与抽取；PASS/FAIL 仍由 verifier 裁决。AI proposes. VeriFlow proves.
          </p>
        </header>
        <div className="field">
          <label htmlFor="compose-nl">Requirement</label>
          <textarea
            id="compose-nl"
            className="compose-nl"
            rows={6}
            value={nl}
            onChange={(event) => setNl(event.target.value)}
          />
        </div>
        <div className="compose-actions">
          <button className="primary" type="button" disabled={busy} onClick={compile}>
            {busy ? phase || "编译中" : "编译"}
          </button>
          {EXAMPLES.map((item) => (
            <button key={item.name} type="button" disabled={busy} onClick={() => loadExample(item.name)}>
              {item.label}
            </button>
          ))}
        </div>
        {error ? <p className="err" role="alert">{error}</p> : null}
        <p className="caption follow">
          弱测资攻击专门砸「生成器从不打上界」。过不了攻击的题，审题通过也发不出去。
        </p>
        <h2 className="section-title">草稿</h2>
        {!loaded ? (
          <div aria-hidden="true">
            <div className="skel wide" />
            <div className="skel mid" />
          </div>
        ) : !rows.length ? (
          <div className="empty">
            <p>还没有草稿。先编译一题。</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>题意</th>
                  <th>状态</th>
                  <th>审题</th>
                  <th>入库</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="num">
                      <Link href={`/compose/${row.id}`}>{row.id}</Link>
                    </td>
                    <td className="wrap">
                      <Link href={`/compose/${row.id}`}>{row.source_nl.slice(0, 36)}</Link>
                    </td>
                    <td>
                      <span className={`verdict ${row.status === "blocked" ? "WA" : row.status === "published" ? "AC" : ""}`}>
                        {row.status}
                      </span>
                    </td>
                    <td>{row.gate_status}</td>
                    <td>{row.published_problem_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </Shell>
  );
}
