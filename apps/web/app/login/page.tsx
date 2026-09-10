"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setSession } from "@/lib/api";
import { readTheme, type Theme } from "@/lib/theme";
import ThemeToggle from "@/components/ThemeToggle";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("demo");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
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

  return (
    <div className="login-wrap">
      <div className="theme-dock">
        <ThemeToggle theme={theme} onToggle={setTheme} />
      </div>
      <div className="login-card">
        <div className="brand" style={{ marginBottom: 8 }}>
          <span className="brand-mark" aria-hidden="true">
            V
          </span>
          <span className="brand-text">
            <strong>验流</strong>
            <span>Veriflow</span>
          </span>
        </div>
        <h1>登录</h1>
        <p className="lead">模型不当裁判。把代码交给环境，过样例不算完。</p>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="user">用户名</label>
            <input
              id="user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label htmlFor="pass">密码</label>
            <input
              id="pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error ? <div className="err" role="alert">{error}</div> : null}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? "登录中…" : "登录"}
          </button>
        </form>
        <p className="hint">演示账号 demo / demo</p>
      </div>
    </div>
  );
}
