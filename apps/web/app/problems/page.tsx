"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { api, ProblemListItem, SubmissionRow } from "@/lib/api";

function rate(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

function diffClass(value: number) {
  if (value < 1000) return "diff-easy";
  if (value < 1400) return "diff-mid";
  return "diff-hard";
}

type StatusFilter = "全部" | "已解决" | "尝试中" | "未开始";

export default function ProblemsPage() {
  const [rows, setRows] = useState<ProblemListItem[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [error, setError] = useState("");
  const [tag, setTag] = useState("全部");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("全部");
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      api.problems(),
      api.submissions().catch(() => ({ submissions: [] as SubmissionRow[] })),
    ])
      .then(([probData, subData]) => {
        setRows(probData.problems);
        setSubmissions(subData.submissions || []);
      })
      .catch(() => setError("题库还没挂上。确认 API 已启动。"))
      .finally(() => setLoaded(true));
  }, []);

  const userStatusMap = useMemo(() => {
    const map = new Map<string, "AC" | "WA" | "NONE">();
    for (const s of submissions) {
      const current = map.get(s.problem_id);
      if (s.verdict === "AC") {
        map.set(s.problem_id, "AC");
      } else if (!current || current === "NONE") {
        map.set(s.problem_id, "WA");
      }
    }
    return map;
  }, [submissions]);

  const stats = useMemo(() => {
    let solved = 0;
    let attempted = 0;
    for (const row of rows) {
      const st = userStatusMap.get(row.id);
      if (st === "AC") solved++;
      else if (st === "WA") attempted++;
    }
    const total = rows.length;
    const pct = total ? Math.round((solved / total) * 100) : 0;
    return { solved, attempted, total, pct };
  }, [rows, userStatusMap]);

  const tags = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((row) => row.tags.forEach((item) => set.add(item)));
    return ["全部", ...Array.from(set).sort()];
  }, [rows]);

  const visible = rows.filter((row) => {
    const st = userStatusMap.get(row.id) || "NONE";
    if (statusFilter === "已解决" && st !== "AC") return false;
    if (statusFilter === "尝试中" && st !== "WA") return false;
    if (statusFilter === "未开始" && st !== "NONE") return false;

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
          <h1>题目库</h1>
          <p className="lead">涵盖已通过完整规格验证与沙箱对拍的算法题目集，支持在线提交与性能评测。</p>
        </header>
        {error ? <p className="err" role="alert">{error}</p> : null}

        {loaded ? (
          <section className="vf-problems-progress-card" aria-label="训练进度概览">
            <div className="vf-problems-progress-info">
              <div className="vf-problems-progress-title">
                <span className="vf-problems-progress-icon">🎯</span>
                <strong>训练进度：已解决 {stats.solved} / {stats.total} 题 ({stats.pct}%)</strong>
                {stats.attempted > 0 ? (
                  <span className="vf-problems-progress-attempted">· 尝试中 {stats.attempted} 题</span>
                ) : null}
              </div>
              <div className="vf-status-filters" role="tablist" aria-label="做题状态筛选">
                {(["全部", "已解决", "尝试中", "未开始"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`vf-status-pill ${statusFilter === s ? "active" : ""}`}
                    aria-pressed={statusFilter === s}
                    onClick={() => setStatusFilter(s)}
                  >
                    {s} {s === "全部" ? `(${stats.total})` : s === "已解决" ? `(${stats.solved})` : s === "尝试中" ? `(${stats.attempted})` : `(${stats.total - stats.solved - stats.attempted})`}
                  </button>
                ))}
              </div>
            </div>
            <div className="vf-progress-track" title={`已攻克 ${stats.solved} 题，尝试中 ${stats.attempted} 题`}>
              <div
                className="vf-progress-fill-ac"
                style={{ width: `${stats.total ? (stats.solved / stats.total) * 100 : 0}%` }}
              />
              <div
                className="vf-progress-fill-wa"
                style={{ width: `${stats.total ? (stats.attempted / stats.total) * 100 : 0}%` }}
              />
            </div>
          </section>
        ) : null}

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
                  <th style={{ width: "88px" }}>状态</th>
                  <th>编号</th>
                  <th>标题</th>
                  <th className="num">难度</th>
                  <th>标签</th>
                  <th className="num">通过率</th>
                  <th className="num" title="变异测试评估：测试用例集对潜在逻辑缺陷代码的击杀率，反映测资防 Hack 强度">
                    测资强度 (击杀率)
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const st = userStatusMap.get(row.id) || "NONE";
                  return (
                    <tr key={row.id}>
                      <td>
                        {st === "AC" ? (
                          <span className="verdict AC" style={{ fontSize: "11px", padding: "1px 6px" }}>
                            ✔ AC
                          </span>
                        ) : st === "WA" ? (
                          <span className="verdict WA" style={{ fontSize: "11px", padding: "1px 6px" }}>
                            ✘ 尝试
                          </span>
                        ) : (
                          <span className="ghost" style={{ fontSize: "13px", paddingLeft: "4px" }}>
                            —
                          </span>
                        )}
                      </td>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </Shell>
  );
}
