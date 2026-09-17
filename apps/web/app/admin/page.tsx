"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { AdminUser, api } from "@/lib/api";

const ROLE_ZH: Record<string, string> = {
  contestant: "选手",
  setter: "出题",
  admin: "管理员",
};

export default function AdminUsersPage() {
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("contestant");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError("");
    try {
      const data = await api.adminUsers();
      setRows(data.users);
    } catch (err) {
      setError((err as Error).message || "读不到账号列表。");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.adminCreateUser(username.trim(), password, role);
      setUsername("");
      setPassword("");
      setRole("contestant");
      await refresh();
    } catch (err) {
      setError((err as Error).message || "没建成。");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row: AdminUser) {
    setError("");
    try {
      await api.adminDisableUser(row.id, !row.disabled);
      await refresh();
    } catch (err) {
      setError((err as Error).message || "没改成。");
    }
  }

  return (
    <AdminShell>
      <main className="page wide">
        <header className="page-head">
          <p className="kicker">后台</p>
          <h1>账号</h1>
          <p className="lead">开账号、停用账号。停用后不能再登录。</p>
        </header>
        {error ? <p className="err" role="alert">{error}</p> : null}
        <form className="vf-admin-form" onSubmit={createUser}>
          <label>
            用户名
            <input value={username} onChange={(event) => setUsername(event.target.value)} required minLength={2} disabled={busy} />
          </label>
          <label>
            密码
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={4} disabled={busy} />
          </label>
          <label>
            身份
            <select value={role} onChange={(event) => setRole(event.target.value)} disabled={busy}>
              <option value="contestant">选手</option>
              <option value="setter">出题</option>
              <option value="admin">管理员</option>
            </select>
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "正在添加…" : "添加账号"}
          </button>
        </form>
        {!loaded ? (
          <p className="ghost">正在读取账号…</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>用户名</th>
                  <th>身份</th>
                  <th className="num">提交</th>
                  <th className="num">通过题</th>
                  <th>状态</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.username}</td>
                    <td>{ROLE_ZH[row.role] || row.role}</td>
                    <td className="num">{row.submissions}</td>
                    <td className="num">{row.solved}</td>
                    <td>{row.disabled ? "已停用" : "可用"}</td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggle(row)}>
                        {row.disabled ? "恢复" : "停用"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AdminShell>
  );
}
