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
  const tour = search.get("tour") === "1";
  const [train, setTrain] = useState<Record<string, number | null> | null>(null);
  useEffect(() => {
    api.report().then(setTrain).catch(() => undefined);
  }, []);
  return (
    <main className="page vf-page">
      <header className="page-head split tight">
        <div>
          <p className="kicker">入库检查</p>
          <h1>入库检查</h1>
          <p className="lead">AI 可以帮忙出题，但题进库必须过检查。过不过由验证器根据记录判定，不是模型自评。</p>
          <ol className="judge-path" aria-label="三分钟演示">
            <li><span>1</span>拦住：该入库却未入库</li>
            <li><span>2</span>证据：轨迹中未见这一步</li>
            <li><span>3</span>修复仍受约束：AI 补丁也要过守卫</li>
          </ol>
        </div>
      </header>
      <VerificationConsole initialDemo={demo} tour={tour} latestOnOpen={!search.has("demo") && !tour} />
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
      <Suspense fallback={<p className="page ghost">加载验证工作台…</p>}>
        <ReportBody />
      </Suspense>
    </Shell>
  );
}
