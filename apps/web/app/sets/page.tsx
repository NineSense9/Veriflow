"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { api } from "@/lib/api";

type SetRow = {
  id: string;
  title: string;
  problems: { id: string; title: string }[];
};

export default function SetsPage() {
  const [rows, setRows] = useState<SetRow[] | null>(null);
  useEffect(() => {
    api
      .sets()
      .then((data) => setRows(data.sets))
      .catch(() => setRows([]));
  }, []);
  return (
    <Shell>
      <main className="page">
        <header className="page-head">
          <h1>题单</h1>
          <p className="lead">按 ACM 训练路径拆开。每组是一条谱系，不是营销卡片。</p>
        </header>
        {rows === null ? (
          <div aria-hidden="true">
            <div className="skel wide" />
            <div className="skel mid" />
          </div>
        ) : !rows.length ? (
          <div className="empty">
            <p>题单还没挂上。</p>
          </div>
        ) : (
          <div className="set-list">
            {rows.map((row) => (
              <section className="set-block" key={row.id}>
                <h2>{row.title}</h2>
                <ol>
                  {row.problems.map((problem) => (
                    <li key={problem.id}>
                      <Link href={`/problems/${problem.id}`}>
                        {problem.id} {problem.title}
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </main>
    </Shell>
  );
}
