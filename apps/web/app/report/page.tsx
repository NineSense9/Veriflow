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
          <p className="kicker">AI 出题质检门禁</p>
          <h1>AI 出题流水线全链路质检</h1>
          <p className="lead">面向 AI 自动生成算法题的多维确定性分析：静态检查拓扑与类型，沙箱模拟真实执行轨迹；严防残缺题目、未审题目流入 OJ 题库。</p>
          <ol className="judge-path" aria-label="核心验证流程">
            <li><span>1</span> 门禁拦截：沙箱模拟捕获隐蔽时序跳步与未闭合分支</li>
            <li><span>2</span> 证据溯源：提取最小反例与执行违规轨迹</li>
            <li><span>3</span> 闭环修复：生成确定性补丁复验，门禁就绪后安全入库</li>
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
