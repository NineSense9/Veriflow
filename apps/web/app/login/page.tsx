"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setSession } from "@/lib/api";
import { readTheme, type Theme } from "@/lib/theme";
import ThemeToggle from "@/components/ThemeToggle";
import Brand from "@/components/Brand";


const PIPE = [
  { id: "req", label: "Requirement", hint: "自然语言题意 / 出题约束" },
  { id: "spec", label: "WorkflowSpec", hint: "编译成可检查约束" },
  { id: "ir", label: "Workflow IR", hint: "DAG：工具、守卫、审题门" },
  { id: "s", label: "Structural", hint: "连通、无环、孤立节点" },
  { id: "m", label: "Semantic", hint: "必要动作、顺序、触发对齐" },
  { id: "e", label: "Executable", hint: "Mock runtime · 时序监视" },
  { id: "fix", label: "Repair / Gate", hint: "受约束 Patch，再验证" },
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("demo");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.login(username, password);
      setSession(result.username, result.token);
      router.replace("/");
    } catch {
      setError("用户名或密码不正确。");
    } finally {
      setBusy(false);
    }
  }

  function fillDemo() {
    setUsername("demo");
    setPassword("demo");
    setError("");
  }

  return (
    <div className="login-wrap">
      <div className="theme-dock">
        <ThemeToggle theme={theme} onToggle={setTheme} />
      </div>
      <section className="login-story" aria-label="产品说明">
        <Brand href={null} />
        <h1>
          把 LLM 生成的出题工作流
          <br />
          关进可检查的门
        </h1>
        <p>
          VeriFlow 不是打一个分数。它把需求编成规格，用确定性算法做结构、语义与可执行验证，给出 Issue、反例路径和受约束修复。
        </p>
        <ol className="login-pipe">
          {PIPE.map((step) => (
            <li key={step.id}>
              <strong>{step.label}</strong>
              <span>{step.hint}</span>
            </li>
          ))}
        </ol>
        <p className="login-aside">模型当编译器。沙箱当裁判。判定不来自 LLM。</p>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="login-brand">
            <Brand href={null} />
          </div>
          <h2>登录</h2>
          <p className="lead">评委与演示请用体验账号。真正的鉴权没有关掉。</p>
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="user">用户名</label>
              <input
                id="user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
            <div className="field">
              <label htmlFor="pass">密码</label>
              <div className="secret-field">
                <input
                  id="pass"
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-pressed={showPass}
                  aria-label={showPass ? "隐藏密码" : "显示密码"}
                  title={showPass ? "隐藏密码" : "显示密码"}
                  onClick={() => setShowPass((v) => !v)}
                >
                  {showPass ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                      <path d="M3 3l18 18M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-4.4M9.9 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a16 16 0 0 1-3.2 3.8M6.1 6.1A16 16 0 0 0 2 12s4 7 10 7c1.3 0 2.5-.3 3.6-.8" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="login-err" role="alert">
              {error || "\u00a0"}
            </div>
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? "登录中…" : "登录"}
            </button>
          </form>
          <div className="login-demo">
            <p className="hint">体验账号 demo / demo</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={fillDemo}>
              填入体验账号
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
