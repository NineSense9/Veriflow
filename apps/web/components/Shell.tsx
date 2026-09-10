"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, clearSession, currentUsername } from "@/lib/api";
import { readTheme, type Theme } from "@/lib/theme";
import ThemeToggle from "@/components/ThemeToggle";

const GROUPS = [
  [{ href: "/", label: "工作台" }],
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
  const [navOpen, setNavOpen] = useState(false);

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

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setNavOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!user) {
    return (
      <div className="shell">
        <header className="topbar">
          <span className="brand">
            <span className="brand-mark" aria-hidden="true">
              V
            </span>
            <span className="brand-text">
              <strong>验流</strong>
              <span>Veriflow</span>
            </span>
          </span>
        </header>
        <div id="main">
          <p className="page ghost">正在校验会话…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        跳到内容
      </a>
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            V
          </span>
          <span className="brand-text">
            <strong>验流</strong>
            <span>Veriflow</span>
          </span>
        </Link>
        <button
          type="button"
          className="icon-btn nav-toggle"
          aria-expanded={navOpen}
          aria-controls="site-nav"
          aria-label={navOpen ? "收起导航" : "打开导航"}
          onClick={() => setNavOpen((open) => !open)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            {navOpen ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
        <nav id="site-nav" className={navOpen ? "nav open" : "nav"}>
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
          <span className="sandbox" title={`评测沙箱：${sandbox}`}>
            <span className={sandbox === "down" ? "dot down" : "dot"} />
            <span>{sandbox}</span>
          </span>
          <span className="user-name">{user}</span>
          <ThemeToggle theme={theme} onToggle={setTheme} />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
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
            退出
          </button>
        </div>
      </header>
      <div id="main">{children}</div>
      <footer className="footer">
        <span>验流 Veriflow · 模型当编译器与攻击者，环境当裁判</span>
        <span>C++17 / Python3</span>
      </footer>
    </div>
  );
}
