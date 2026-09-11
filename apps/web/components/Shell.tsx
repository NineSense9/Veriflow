"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, clearSession, currentUsername } from "@/lib/api";
import { readTheme, type Theme } from "@/lib/theme";
import ThemeToggle from "@/components/ThemeToggle";
import Brand from "@/components/Brand";

const CORE = [
  { href: "/", label: "工作台" },
  { href: "/compose", label: "需求编译" },
  { href: "/report", label: "验证" },
  { href: "/evidence", label: "证据" },
];

const EVAL_ITEMS = [
  { href: "/history", label: "历史" },
  { href: "/benchmark", label: "基准" },
  { href: "/algorithms", label: "算法中心" },
];

const LAB_ITEMS = [
  { href: "/problems", label: "题库" },
  { href: "/sets", label: "题单" },
  { href: "/status", label: "提交记录" },
  { href: "/stress", label: "对拍" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function anyActive(pathname: string, items: { href: string }[]) {
  return items.some((item) => isActive(pathname, item.href));
}

function Drop({
  label,
  items,
  pathname,
  open,
  onToggle,
}: {
  label: string;
  items: { href: string; label: string }[];
  pathname: string;
  open: boolean;
  onToggle: () => void;
}) {
  const active = anyActive(pathname, items);
  return (
    <div className="nav-drop">
      <button
        type="button"
        className={active || open ? "on" : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onToggle}
      >
        {label}
      </button>
      {open ? (
        <div className="nav-drop-panel" role="menu">
          {items.map((item) => (
            <Link key={item.href} href={item.href} role="menuitem" className={isActive(pathname, item.href) ? "active" : undefined} aria-current={isActive(pathname, item.href) ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [user, setUser] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState("…");
  const [theme, setTheme] = useState<Theme>("light");
  const [navOpen, setNavOpen] = useState(false);
  const [drop, setDrop] = useState<string | null>(null);
  const bar = useRef<HTMLElement>(null);

  useEffect(() => {
    const name = currentUsername();
    if (!name) {
      routerRef.current.replace("/login");
      return;
    }
    setUser(name);
    api
      .me()
      .then((me) => setUser(me.username))
      .catch(() => {
        clearSession();
        routerRef.current.replace("/login");
      });
    api
      .health()
      .then((h) => setSandbox(h.sandbox))
      .catch(() => setSandbox("down"));
    setTheme(readTheme());
  }, []);

  useEffect(() => {
    setNavOpen(false);
    setDrop(null);
  }, [pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNavOpen(false);
        setDrop(null);
      }
    }
    function onDoc(event: MouseEvent) {
      if (bar.current && !bar.current.contains(event.target as Node)) setDrop(null);
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, []);

  const drawer = useMemo(
    () => (
      <nav className="drawer-nav" id="site-nav">
        <p className="nav-group-label">核心</p>
        {CORE.map((link) => (
          <Link key={link.href} href={link.href} className={isActive(pathname, link.href) ? "active" : undefined}>
            {link.label}
          </Link>
        ))}
        <p className="nav-group-label">评估</p>
        {EVAL_ITEMS.map((link) => (
          <Link key={link.href} href={link.href} className={isActive(pathname, link.href) ? "active" : undefined}>
            {link.label}
          </Link>
        ))}
        <p className="nav-group-label">实验室</p>
        {LAB_ITEMS.map((link) => (
          <Link key={link.href} href={link.href} className={isActive(pathname, link.href) ? "active" : undefined}>
            {link.label}
          </Link>
        ))}
        <p className="nav-group-label">系统</p>
        <Link href="/settings" className={isActive(pathname, "/settings") ? "active" : undefined}>
          设置
        </Link>
      </nav>
    ),
    [pathname],
  );

  if (!user) {
    return (
      <div className="shell">
        <header className="topbar">
          <Brand href={null} />
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
      {navOpen ? <button type="button" className="nav-scrim" aria-label="关闭导航" onClick={() => setNavOpen(false)} /> : null}
      <aside className={navOpen ? "drawer open" : "drawer"}>{drawer}</aside>
      <header className="topbar" ref={bar}>
        <Brand />
        <button
          type="button"
          className="icon-btn nav-toggle"
          aria-expanded={navOpen}
          aria-controls="site-nav"
          aria-label={navOpen ? "收起导航" : "打开导航"}
          onClick={() => setNavOpen((open) => !open)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            {navOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        <nav className="top-nav" aria-label="主导航">
          {CORE.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={isActive(pathname, link.href) ? "active" : undefined}
              aria-current={isActive(pathname, link.href) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
          <Drop label="评估" items={EVAL_ITEMS} pathname={pathname} open={drop === "eval"} onToggle={() => setDrop(drop === "eval" ? null : "eval")} />
          <Drop label="实验室" items={LAB_ITEMS} pathname={pathname} open={drop === "lab"} onToggle={() => setDrop(drop === "lab" ? null : "lab")} />
        </nav>
        <div className="top-meta">
          <span className="sandbox" title={`评测沙箱：${sandbox}`}>
            <span className={sandbox === "down" ? "dot down" : "dot"} />
            <span>{sandbox}</span>
          </span>
          <span className="user-name">{user}</span>
          <ThemeToggle theme={theme} onToggle={setTheme} />
          <Link href="/settings" className="btn btn-ghost btn-sm">
            设置
          </Link>
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
        <span>AI proposes. VeriFlow proves. 判定不来自模型。</span>
        <span>C++17 / Python3</span>
      </footer>
    </div>
  );
}
