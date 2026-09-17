"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, setSession } from "@/lib/api";
import { readTheme, type Theme } from "@/lib/theme";
import ThemeToggle from "@/components/ThemeToggle";
import Brand from "@/components/Brand";
import styles from "../../entry.module.css";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
    <div className={`${styles.login} vf-admin-login`}>
      <div className={styles.themeDock}>
        <ThemeToggle theme={theme} onToggle={setTheme} />
      </div>
      <section className={styles.loginPanel} aria-labelledby="admin-login-title">
        <div className={styles.loginCard}>
          <Brand href={null} />
          <p className={styles.eyebrow}>后台</p>
          <h2 id="admin-login-title">管理账号和题库</h2>
          <p className={styles.loginDescription}>这里不管刷题和对拍。选手请走训练场登录。</p>
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
              <input
                id="admin-pass"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                disabled={busy}
              />
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
    </div>
  );
}
