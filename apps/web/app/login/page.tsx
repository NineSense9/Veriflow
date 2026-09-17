"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, setSession } from "@/lib/api";
import { readTheme, type Theme } from "@/lib/theme";
import ThemeToggle from "@/components/ThemeToggle";
import Brand from "@/components/Brand";
import BrandAmbient from "@/components/BrandAmbient";
import FadeContent from "@/components/reactbits/FadeContent";
import styles from "../entry.module.css";

const PIPE = [
  { label: "题库", hint: "选题、看题、按标签筛选" },
  { label: "对拍", hint: "生成器、暴力和解对照" },
  { label: "提交", hint: "沙箱实测，不是模型自评" },
  { label: "入库检查", hint: "AI 出题进库前必须过验证器" },
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
      setSession(result.username, result.token, result.role);
      router.replace(result.role === "admin" ? "/admin" : "/");
    } catch (err) {
      const message = (err as Error).message || "";
      setError(message.includes("停用") ? "账号已停用。" : "用户名或密码不正确。");
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
    <div className={styles.login}>
      <div className={styles.themeDock}>
        <ThemeToggle theme={theme} onToggle={setTheme} />
      </div>
      <section className={styles.loginIntro} aria-label="产品介绍">
        <BrandAmbient variant="rays" className={styles.loginAmbient} />
        <FadeContent className={styles.loginIntroContent}>
          <Brand href={null} />
          <p className={styles.eyebrow}>训练评测</p>
          <h1>题库、对拍、提交。<br /><span>进库前要过检查。</span></h1>
          <p className={styles.introDescription}>刷题和对拍在训练场。<br />AI 可以帮忙出题，但不能自己说能进库。</p>
        </FadeContent>
      </section>
      <section className={styles.loginPanel} aria-labelledby="login-title">
        <div className={styles.loginCard}>
          <p className={styles.eyebrow}>进入训练场</p>
          <h2 id="login-title">欢迎使用 VeriFlow</h2>
          <p className={styles.loginDescription}>登录后先到首页。题库、对拍、提交在顶栏。</p>
          <form onSubmit={onSubmit} aria-busy={busy}>
            <div className="field">
              <label htmlFor="user">用户名</label>
              <input
                id="user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                disabled={busy}
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
                  required
                  disabled={busy}
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
              {busy ? "正在登录…" : "进入"}
            </button>
          </form>
          <div className={styles.loginDemo}>
            <div><span>体验账号</span><code>demo / demo</code></div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={fillDemo}>
              填入体验账号
            </button>
          </div>
          <p className="vf-admin-back">
            <Link href="/admin/login">管理员入口</Link>
          </p>
        </div>
      </section>
      <section className={styles.loginStory} aria-label="训练场与入库检查">
        <ol className={styles.loginPath}>
          {PIPE.map((step, index) => (
            <li key={step.label}>
              <span className={styles.stepNumber}>0{index + 1}</span>
              <strong>{step.label}</strong>
              <span>{step.hint}</span>
            </li>
          ))}
        </ol>
        <p className={styles.loginPrinciple}><span aria-hidden="true">✓</span> 训练在题库和对拍；进库前由验证器检查，不是模型说了算。</p>
      </section>
    </div>
  );
}
