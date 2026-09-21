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
          <p className="kicker">工作流验证</p>
          <h1>工作流全链路验证</h1>
          <p className="lead">面向 AI 生成出题流水线的多维确定性分析：涵盖结构连通、语义时序、数据流绑定与沙箱异常模拟。</p>
          <ol className="judge-path" aria-label="核心验证流程">
            <li><span>1</span> 缺陷拦截：检测时序缺失与未闭合分支</li>
            <li><span>2</span> 证据溯源：提取最小反例与执行轨迹</li>
            <li><span>3</span> 闭环修复：生成受约束补丁并执行增量复验</li>
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
