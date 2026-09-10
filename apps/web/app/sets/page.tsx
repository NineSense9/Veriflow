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
  const [rows, setRows] = useState<SetRow[]>([]);
  useEffect(() => {
    api.sets().then((data) => setRows(data.sets)).catch(() => undefined);
  }, []);
  return (
    <Shell>
      <main className="page wide">
        <header className="page-head">
          <p className="kicker">题单</p>
          <h1>训练谱系</h1>
          <p className="lead">按 ACM 训练路径拆开。每张是一组题目，不是营销卡片。</p>
        </header>
        {!rows.length ? (
          <div className="empty">
            <p>题单还没挂上。</p>
          </div>
        ) : (
          <div className="set-grid">
            {rows.map((row) => (
              <section className="panel set-card" key={row.id}>
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
