"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, clearSession, currentUsername } from "@/lib/api";
import { readTheme, type Theme } from "@/lib/theme";
import ThemeToggle from "@/components/ThemeToggle";
import Brand from "@/components/Brand";

const NAV = [
  { href: "/admin", label: "账号" },
  { href: "/admin/problems", label: "题库" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [user, setUser] = useState("");
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    if (!currentUsername()) {
      routerRef.current.replace("/admin/login");
      return;
    }
    api
      .me()
      .then((me) => {
        if (me.role !== "admin") {
          clearSession();
          routerRef.current.replace("/admin/login");
          return;
        }
        setUser(me.username);
      })
      .catch(() => {
        clearSession();
        routerRef.current.replace("/admin/login");
      });
    setTheme(readTheme());
  }, []);

  if (!user) {
    return (
      <div className="shell">
        <header className="topbar">
          <Brand href={null} />
        </header>
        <p className="page ghost">正在校验管理员…</p>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Brand href="/admin" />
        <nav className="top-nav" aria-label="后台导航">
          {NAV.map((item) => {
            const on = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={on ? "active" : undefined} aria-current={on ? "page" : undefined}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="top-meta">
          <span className="user-name">{user}</span>
          <ThemeToggle theme={theme} onToggle={setTheme} />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              try {
                await api.logout();
              } catch {
                /* leave */
              }
              clearSession();
              router.replace("/admin/login");
            }}
          >
            退出
          </button>
        </div>
      </header>
      <div id="main">{children}</div>
    </div>
  );
}
