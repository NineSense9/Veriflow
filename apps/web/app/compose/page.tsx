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
      <main className="page">
        <div className="kicker">Problemsetter</div>
        <h1>出题编译</h1>
        <p className="ghost">自然语言先变成带类型的图。缺审题门或弱测资过不了入库。</p>
        <textarea
          className="compose-nl"
          rows={5}
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
        {error ? <p className="ghost">{error}</p> : null}
        <h2 className="kicker" style={{ marginTop: 28 }}>
          草稿
        </h2>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>题意</th>
              <th>状态</th>
              <th>审题</th>
              <th>入库</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/compose/${row.id}`}>{row.id}</Link>
                </td>
                <td>
                  <Link href={`/compose/${row.id}`}>{row.source_nl.slice(0, 36)}</Link>
                </td>
                <td>{row.status}</td>
                <td>{row.gate_status}</td>
                <td>{row.published_problem_id ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </Shell>
  );
}
