"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, clearSession, currentUsername } from "@/lib/api";
import { readTheme, toggleTheme, type Theme } from "@/lib/theme";

const GROUPS = [
  [{ href: "/", label: "训练桌" }],
  [
    { href: "/problems", label: "题库" },
    { href: "/sets", label: "题单" },
    { href: "/status", label: "状态" },
  ],
  [
    { href: "/stress", label: "对拍" },
    { href: "/compose", label: "出题" },
  ],
  [
    { href: "/report", label: "报告" },
    { href: "/settings", label: "设置" },
  ],
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState("…");
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const name = currentUsername();
    if (!name) {
      router.replace("/login");
      return;
    }
    setUser(name);
    api
      .me()
      .then((me) => setUser(me.username))
      .catch(() => {
        clearSession();
        router.replace("/login");
      });
    api
      .health()
      .then((h) => setSandbox(h.sandbox))
      .catch(() => setSandbox("down"));
    setTheme(readTheme());
  }, [router]);

  if (!user) return null;

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <strong>VERIFLOW</strong>
          <span>验流 · 训练站</span>
        </Link>
        <nav className="nav">
          {GROUPS.map((group, index) => (
            <span key={group[0].href} style={{ display: "contents" }}>
              {index > 0 ? <span className="nav-split" /> : null}
              {group.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={
                    link.href === "/"
                      ? pathname === "/"
                        ? "active"
                        : ""
                      : pathname.startsWith(link.href)
                        ? "active"
                        : ""
                  }
                >
                  {link.label}
                </Link>
              ))}
            </span>
          ))}
        </nav>
        <div className="top-meta">
          <span className={sandbox === "down" ? "dot down" : "dot"} />
          <span>{sandbox}</span>
          <span>{user}</span>
          <button
            type="button"
            className="theme-btn"
            onClick={() => setTheme(toggleTheme())}
          >
            {theme === "dark" ? "白天" : "夜间"}
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await api.logout();
              } catch {
                /* still leave */
              }
              clearSession();
              router.replace("/login");
            }}
          >
            离场
          </button>
        </div>
      </header>
      {children}
      <footer className="footer">
        <span>验流 Veriflow · 模型当编译器与攻击者，环境当裁判</span>
        <span>题库 30 题 · C++17 / Python3</span>
      </footer>
    </div>
  );
}
