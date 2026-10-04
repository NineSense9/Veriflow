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
  const demo = search.get("demo") || "case1_order";
  const tour = search.get("tour") === "1";
  const [train, setTrain] = useState<Record<string, number | null> | null>(null);
  useEffect(() => {
    api.report().then(setTrain).catch(() => undefined);
  }, []);
  return (
    <main className="page vf-page">
      <header className="page-head split tight">
        <div>
          <p className="kicker">AI 出题质检门禁</p>
          <h1>AI 出题流水线全链路质检</h1>
          <p className="lead">对 AI 提出的出题工作流进行确定性验证：静态检查拓扑与类型，使用模拟轨迹检查运行约束。题包校验和人工审核通过后，才能发布入库。</p>
          <ol className="judge-path" aria-label="核心验证流程">
            <li><span>1</span> 门禁拦截：通过模拟轨迹发现缺失动作与时序违规</li>
            <li><span>2</span> 证据溯源：查看反例切片与违反约束的模拟轨迹</li>
            <li><span>3</span> 闭环修复：受约束补丁复验，工作流 READY 后继续题包校验与人工审核</li>
          </ol>
        </div>
      </header>
      <VerificationConsole initialDemo={demo} tour={tour} latestOnOpen={false} />
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
