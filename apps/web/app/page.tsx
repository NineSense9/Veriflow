"use client";

import Link from "next/link";
import { ArrowUpRight, FilePlus2, GitBranch } from "lucide-react";
import Shell from "@/components/Shell";
import VerificationConsole from "@/components/VerificationConsole";
import BrandAmbient from "@/components/BrandAmbient";
import "./workbench.css";

export default function HomePage() {
  return (
    <Shell>
      <main className="page evidence-home">
        <header className="evidence-home-heading">
          <BrandAmbient variant="lines" />
          <div className="evidence-home-title">
            <span className="workspace-eyebrow"><GitBranch size={14} /> 验流 / 工作台</span>
            <h1>验证工作台<span>从生成，到可信。</span></h1>
            <p>每一个判定，都有一条可追溯的证据链。</p>
          </div>
          <Link href="/compose" className="btn workspace-primary"><FilePlus2 size={15} /> 编译新需求 <ArrowUpRight size={15} /></Link>
        </header>
        <VerificationConsole latestOnOpen />
        <footer className="workspace-footer">
          <span>AI 提出候选 · 验证器独立判定</span>
          <Link href="/problems">算法训练站 <ArrowUpRight size={14} /></Link>
        </footer>
      </main>
    </Shell>
  );
}
