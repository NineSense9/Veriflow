"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api, ComposeSummary } from "@/lib/api";

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

  function refresh() {
    api.composeList().then((data) => setRows(data.projects)).catch(() => undefined);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function compile() {
    setBusy(true);
    setError("");
    try {
      const project = await api.composeCreate(nl);
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
          <p className="kicker">出题</p>
          <h1>出题编译</h1>
          <p className="lead">自然语言进图，静态检查拦住缺门、缺守卫和白名单外的工具。</p>
        </header>
        <div className="compose-hero">
          <div>
            <label className="sr-only" htmlFor="compose-nl">
              题意
            </label>
            <textarea
              id="compose-nl"
              className="compose-nl"
              rows={6}
              value={nl}
              onChange={(event) => setNl(event.target.value)}
            />
            <div className="compose-actions">
              <button className="primary" type="button" disabled={busy} onClick={compile}>
                {busy ? "编译中" : "编译"}
              </button>
              {EXAMPLES.map((item) => (
                <button key={item.name} type="button" disabled={busy} onClick={() => loadExample(item.name)}>
                  {item.label}
                </button>
              ))}
            </div>
            {error ? <p className="err" role="alert">{error}</p> : null}
          </div>
          <section className="panel">
            <h2>编译期拦住什么</h2>
            <p className="ghost">缺审题门、类型对不上、守卫写成自然语言、工具不在白名单，都会在图上标红，不能入库。</p>
            <p className="ghost">弱测资攻击专门砸「生成器从不打上界」。过不了攻击的题，审题通过也发不出去。</p>
          </section>
        </div>
        <h2 className="section-title">草稿</h2>
        {!rows.length ? (
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
                    <td>
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
