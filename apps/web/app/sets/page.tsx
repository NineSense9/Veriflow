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
      <main className="page">
        <div className="kicker">Training sets</div>
        <h1>题单</h1>
        {rows.map((row) => (
          <section className="card" key={row.id} style={{ marginBottom: 16 }}>
            <h2>{row.title}</h2>
            <p>
              {row.problems.map((problem) => (
                <span key={problem.id} style={{ marginRight: 14 }}>
                  <Link href={`/problems/${problem.id}`}>{problem.id}</Link> {problem.title}
                </span>
              ))}
            </p>
          </section>
        ))}
      </main>
    </Shell>
  );
}
