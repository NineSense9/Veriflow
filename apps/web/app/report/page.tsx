"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Shell from "@/components/Shell";
import VerificationConsole from "@/components/VerificationConsole";
import { api } from "@/lib/api";

const TRAIN: { title: string; keys: [string, string][] }[] = [
  {
    title: "训练对照（数据库）",
    keys: [
      ["problems", "题库"],
      ["submissions", "提交"],
      ["ac", "AC"],
      ["wa", "WA"],
      ["hidden_wa", "隐藏 WA"],
      ["compose_projects", "出题项目"],
    ],
  },
];

function ReportBody() {
  const search = useSearchParams();
  const demo = search.get("demo") || "case4_runtime";
  const [train, setTrain] = useState<Record<string, number | null> | null>(null);
  useEffect(() => {
    api.report().then(setTrain).catch(() => undefined);
  }, []);
  return (
    <main className="page vf-page">
      <header className="page-head split tight">
        <div>
          <p className="kicker">核验工作台</p>
          <h1>核验工作台</h1>
          <p className="lead">从问题定位到证据与修复，查看每一步的确定性核验结果。</p>
        </div>
      </header>
      <VerificationConsole initialDemo={demo} />
      {train ? (
        <details className="vf-disclosure vf-training"><summary>{TRAIN[0].title}</summary><div className="vf-disclosure-body">
          <dl className="kv">
            {TRAIN[0].keys.map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{train[key] ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </div></details>
      ) : null}
    </main>
  );
}

export default function ReportPage() {
  return (
    <Shell>
      <Suspense fallback={<p className="page ghost">加载 Console…</p>}>
        <ReportBody />
      </Suspense>
    </Shell>
  );
}
