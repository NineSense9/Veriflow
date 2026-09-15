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
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .problems()
      .then((data) => setRows(data.problems))
      .catch(() => setError("题库还没挂上。确认 API 已启动。"))
      .finally(() => setLoaded(true));
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
        <header className="page-head">
          <h1>题库</h1>
          <p className="lead">训练场。选题、对拍、提交。通过率来自服务端统计，不是模型自评。</p>
        </header>
        <aside className="ingest-banner" aria-label="评委演示：入库检查">
          <p>
            <strong>看为什么这题不能进库</strong>
            规定必须入库，记录里没有这一步，系统拦住。进去可看缺席证据；AI 提补丁也要过守卫，不会自动进库。
          </p>
          <Link className="btn btn-sm btn-primary" href="/report?demo=case4_runtime&tour=1">
            开始演示
          </Link>
        </aside>
        {error ? <p className="err" role="alert">{error}</p> : null}
        <div className="toolbar">
          <label className="sr-only" htmlFor="problem-search">
            搜索题目
          </label>
          <input
            id="problem-search"
            className="search"
            placeholder="VF1001、签到、implementation"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span className="ghost">{visible.length} / {rows.length}</span>
        </div>
        <div className="filters" role="tablist" aria-label="题目标签">
          {tags.map((item) => (
            <button
              key={item}
              type="button"
              className={item === tag ? "on" : ""}
              aria-pressed={item === tag}
              onClick={() => setTag(item)}
            >
              {item}
            </button>
          ))}
        </div>
        {!loaded ? (
          <div aria-hidden="true">
            <div className="skel wide" />
            <div className="skel mid" />
            <div className="skel short" />
          </div>
        ) : !visible.length ? (
          <div className="empty">
            <p>没有匹配的题目。</p>
            <p className="caption">换个标签，或清空搜索。</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>编号</th>
                  <th>标题</th>
                  <th className="num">难度</th>
                  <th>标签</th>
                  <th className="num">通过率</th>
                  <th className="num">变异杀死率</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/problems/${row.id}`}>{row.id}</Link>
                    </td>
                    <td className="wrap">
                      <Link href={`/problems/${row.id}`}>{row.title}</Link>
                    </td>
                    <td className={`num ${diffClass(row.difficulty)}`}>{row.difficulty}</td>
                    <td>
                      {row.tags.map((item) => (
                        <span className="tag" key={item}>
                          {item}
                        </span>
                      ))}
                    </td>
                    <td className="num">{rate(row.ac_rate)}</td>
                    <td className="num">{rate(row.kill_rate)}</td>
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
