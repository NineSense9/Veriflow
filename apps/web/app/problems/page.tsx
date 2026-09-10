"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { api, ProblemListItem } from "@/lib/api";

function rate(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

function diffClass(value: number) {
  if (value < 1000) return "diff-easy";
  if (value < 1400) return "diff-mid";
  return "diff-hard";
}

export default function ProblemsPage() {
  const [rows, setRows] = useState<ProblemListItem[]>([]);
  const [error, setError] = useState("");
  const [tag, setTag] = useState("全部");
  const [query, setQuery] = useState("");

  useEffect(() => {
    api
      .problems()
      .then((data) => setRows(data.problems))
      .catch(() => setError("题库还没挂上。确认 API 已启动。"));
  }, []);

  const tags = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((row) => row.tags.forEach((item) => set.add(item)));
    return ["全部", ...Array.from(set).sort()];
  }, [rows]);

  const visible = rows.filter((row) => {
    const tagOk = tag === "全部" || row.tags.includes(tag);
    const q = query.trim().toLowerCase();
    const textOk =
      !q ||
      row.id.toLowerCase().includes(q) ||
      row.title.toLowerCase().includes(q) ||
      row.tags.some((item) => item.toLowerCase().includes(q));
    return tagOk && textOk;
  });

  return (
    <Shell>
      <main className="page wide">
        <div className="kicker">Problemset</div>
        <h1>题库</h1>
        {error ? <p className="ghost">{error}</p> : null}
        <input
          className="search"
          placeholder="搜索题号、标题或标签"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="filters">
          {tags.map((item) => (
            <button
              key={item}
              type="button"
              className={item === tag ? "on" : ""}
              onClick={() => setTag(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>编号</th>
              <th>标题</th>
              <th>难度</th>
              <th>标签</th>
              <th>通过率</th>
              <th>变异杀死率</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/problems/${row.id}`}>{row.id}</Link>
                </td>
                <td>
                  <Link href={`/problems/${row.id}`}>{row.title}</Link>
                </td>
                <td className={diffClass(row.difficulty)}>{row.difficulty}</td>
                <td>
                  {row.tags.map((item) => (
                    <span className="tag" key={item}>
                      {item}
                    </span>
                  ))}
                </td>
                <td>{rate(row.ac_rate)}</td>
                <td>{rate(row.kill_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </Shell>
  );
}
