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
import styles from "../../entry.module.css";

const JOBS = [
  { label: "账号", hint: "开账号、停用账号" },
  { label: "题库", hint: "上架或下架题目" },
];

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
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
      if (result.role !== "admin") {
        try {
          await api.logout();
        } catch {
          /* ignore */
        }
        setError("这不是管理员账号。训练场请从首页登录。");
        return;
      }
      setSession(result.username, result.token, result.role);
      router.replace("/admin");
    } catch (err) {
      const message = (err as Error).message || "";
      setError(message.includes("停用") ? "账号已停用。" : "用户名或密码不正确。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.login}>
      <div className={styles.themeDock}>
        <ThemeToggle theme={theme} onToggle={setTheme} />
      </div>
      <section className={styles.loginIntro} aria-label="后台说明">
        <BrandAmbient variant="rays" className={styles.loginAmbient} />
        <FadeContent className={styles.loginIntroContent}>
          <Brand href={null} />
          <p className={styles.eyebrow}>后台</p>
          <h1>
            管账号、管题库。
            <br />
            <span>不进训练场。</span>
          </h1>
          <p className={styles.introDescription}>
            这里只开账号、停用账号、上架或下架题目。
            <br />
            刷题、对拍、提交请走训练场登录。
          </p>
        </FadeContent>
      </section>
      <section className={styles.loginPanel} aria-labelledby="admin-login-title">
        <div className={styles.loginCard}>
          <p className={styles.eyebrow}>管理员</p>
          <h2 id="admin-login-title">进入后台</h2>
          <p className={styles.loginDescription}>用管理员账号登录。选手账号进不来。</p>
          <form onSubmit={onSubmit} aria-busy={busy}>
            <div className="field">
              <label htmlFor="admin-user">用户名</label>
              <input
                id="admin-user"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                disabled={busy}
              />
            </div>
            <div className="field">
              <label htmlFor="admin-pass">密码</label>
              <div className="secret-field">
                <input
                  id="admin-pass"
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  disabled={busy}
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-pressed={showPass}
                  aria-label={showPass ? "隐藏密码" : "显示密码"}
                  onClick={() => setShowPass((value) => !value)}
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
              {busy ? "正在登录…" : "进入后台"}
            </button>
          </form>
          <p className="vf-admin-back">
            <Link href="/login">回训练场登录</Link>
          </p>
        </div>
      </section>
      <section className={styles.loginStory} aria-label="后台职责">
        <ol className={styles.loginPath}>
          {JOBS.map((step, index) => (
            <li key={step.label}>
              <span className={styles.stepNumber}>0{index + 1}</span>
              <strong>{step.label}</strong>
              <span>{step.hint}</span>
            </li>
          ))}
        </ol>
        <p className={styles.loginPrinciple}>
          <span aria-hidden="true">✓</span> 后台不管判定。判定仍来自沙箱和检查。
        </p>
      </section>
    </div>
  );
}
