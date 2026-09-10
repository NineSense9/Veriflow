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
        <div className="kicker">Training sets</div>
        <h1>题单</h1>
        <p className="ghost">按 ACM 训练谱系拆开。每张是一份试卷袋，不是营销卡片。</p>
        <div className="set-grid">
          {rows.map((row) => (
            <section className="paper-card set-card" key={row.id}>
              <h2 style={{ marginTop: 0 }}>{row.title}</h2>
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
      </main>
    </Shell>
  );
}
