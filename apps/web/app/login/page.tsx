"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setSession } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("demo");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.login(username, password);
      setSession(result.username, result.token);
      router.replace("/");
    } catch {
      setError("证件不符。检查席位号和口令。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="slip">
        <div className="stamp">NIGHT / DESK</div>
        <div className="kicker" style={{ color: "#9a3b32" }}>
          Contestant slip
        </div>
        <h1>验流入场</h1>
        <p>模型不当裁判。把代码交给环境。过样例不算完。</p>
        <form onSubmit={onSubmit}>
          <label htmlFor="user">席位</label>
          <input
            id="user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <label htmlFor="pass">口令</label>
          <input
            id="pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {error ? <div className="err">{error}</div> : null}
          <button type="submit" disabled={busy}>
            {busy ? "检录中…" : "入场"}
          </button>
        </form>
        <div className="hint">本地演示席位 demo / demo。评委环境会换口令。</div>
      </div>
    </div>
  );
}
