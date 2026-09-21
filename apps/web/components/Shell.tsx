"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, clearSession, currentUsername } from "@/lib/api";
import { readTheme, type Theme } from "@/lib/theme";
import { applyPrefs, readPrefs } from "@/lib/prefs";
import ThemeToggle from "@/components/ThemeToggle";
import Brand from "@/components/Brand";
import PillNav from "@/components/reactbits/PillNav";
import CardNav from "@/components/reactbits/CardNav";
import StaggeredMenu from "@/components/reactbits/StaggeredMenu";

const CORE = [
  { href: "/", label: "控制台" },
  { href: "/problems", label: "题库训练" },
  { href: "/status", label: "沙箱判题" },
  { href: "/stress", label: "智能对拍" },
  { href: "/report", label: "出题质检" },
  { href: "/compose", label: "需求出题" },
];

const LAB_LINKS = [
  { href: "/benchmark", label: "评测基准", description: "55 组全量验证与变异评测" },
  { href: "/evidence", label: "证据链分析", description: "缺陷溯源与最小反例轨迹" },
  { href: "/algorithms", label: "算法矩阵", description: "确定性验证器与监控器" },
  { href: "/architecture", label: "系统架构", description: "模块交互与数据流向地图" },
  { href: "/history", label: "历史记录", description: "历史核验与门禁放行报告" },
];

const SANDBOX_LINKS = [
  { href: "/sets", label: "题单分组", description: "竞赛经典题单集合" },
  { href: "/problems/VF1001", label: "两数之和 (样例题)", description: "三列反例与启发教练" },
  { href: "/problems/VF1004", label: "最长上升子序列", description: "数据生成器与对拍验证" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function anyActive(pathname: string, items: { href: string }[]) {
  return items.some((item) => isActive(pathname, item.href));
}

function CardDrop({
  label,
  items,
  pathname,
  open,
  onToggle,
  onClose,
}: {
  label: string;
  items: { href: string; label: string; description: string }[];
  pathname: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const active = anyActive(pathname, items);
  return (
    <div className="nav-drop vf-card-drop">
      <button type="button" className={active || open ? "on" : undefined} aria-expanded={open} aria-haspopup="menu" onClick={onToggle}>
        {label}
      </button>
      <CardNav open={open} onClose={onClose} items={[{ label, links: items }]} />
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [user, setUser] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [sandbox, setSandbox] = useState("…");
  const [theme, setTheme] = useState<Theme>("light");
  const [navOpen, setNavOpen] = useState(false);
  const [drop, setDrop] = useState<string | null>(null);
  const bar = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState({ x: 0, w: 0, on: 0 });

  useEffect(() => {
    const name = currentUsername();
    if (!name) {
      routerRef.current.replace("/login");
      return;
    }
    setUser(name);
    api
      .me()
      .then((me) => {
        setUser(me.username);
        setRole(me.role);
      })
      .catch(() => {
        clearSession();
        routerRef.current.replace("/login");
      });
    api
      .health()
      .then((h) => setSandbox(h.sandbox))
      .catch(() => setSandbox("down"));
    setTheme(readTheme());
    applyPrefs(readPrefs());
  }, []);

  useEffect(() => {
    setNavOpen(false);
    setDrop(null);
  }, [pathname]);

  useEffect(() => {
    const root = navRef.current;
    if (!root) return;
    const active = root.querySelector("a.active, button.on") as HTMLElement | null;
    if (!active) {
      setIndicator((prev) => ({ ...prev, on: 0 }));
      return;
    }
    const box = root.getBoundingClientRect();
    const hit = active.getBoundingClientRect();
    setIndicator({ x: hit.left - box.left, w: hit.width, on: 1 });
  }, [pathname, drop, user]);

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
        <p className="nav-group-label">🏆 竞赛训练 (OJ 核心)</p>
        <Link href="/problems" className={isActive(pathname, "/problems") ? "active" : undefined}>
          题库训练
        </Link>
        <Link href="/status" className={isActive(pathname, "/status") ? "active" : undefined}>
          沙箱判题
        </Link>
        <Link href="/stress" className={isActive(pathname, "/stress") ? "active" : undefined}>
          智能对拍
        </Link>
        <Link href="/sets" className={isActive(pathname, "/sets") ? "active" : undefined}>
          题单分组
        </Link>
        <p className="nav-group-label">🛡️ AI 出题质检 (VeriFlow)</p>
        <Link href="/report" className={isActive(pathname, "/report") ? "active" : undefined}>
          出题质检 (全链路验证)
        </Link>
        <Link href="/compose" className={isActive(pathname, "/compose") ? "active" : undefined}>
          需求出题
        </Link>
        <Link href="/benchmark" className={isActive(pathname, "/benchmark") ? "active" : undefined}>
          评测基准
        </Link>
        <Link href="/evidence" className={isActive(pathname, "/evidence") ? "active" : undefined}>
          证据链分析
        </Link>
        <p className="nav-group-label">🔬 算法矩阵与系统</p>
        <Link href="/algorithms" className={isActive(pathname, "/algorithms") ? "active" : undefined}>
          算法矩阵
        </Link>
        <Link href="/architecture" className={isActive(pathname, "/architecture") ? "active" : undefined}>
          系统架构
        </Link>
        <Link href="/history" className={isActive(pathname, "/history") ? "active" : undefined}>
          历史记录
        </Link>
        <p className="nav-group-label">系统</p>
        <Link href="/" className={pathname === "/" ? "active" : undefined}>
          控制台
        </Link>
        <Link href="/account" className={isActive(pathname, "/account") ? "active" : undefined}>
          个人中心
        </Link>
        <Link href="/settings" className={isActive(pathname, "/settings") ? "active" : undefined}>
          设置
        </Link>
        {role === "admin" ? (
          <Link href="/admin" className={isActive(pathname, "/admin") ? "active" : undefined}>
            后台
          </Link>
        ) : null}
      </nav>
    ),
    [pathname, role],
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
      <StaggeredMenu
        open={navOpen}
        onClose={() => setNavOpen(false)}
        items={[
          ...CORE.map((item) => ({ label: item.label, link: item.href })),
          ...LAB_LINKS.map((item) => ({ label: item.label, link: item.href })),
          ...SANDBOX_LINKS.map((item) => ({ label: item.label, link: item.href })),
          { label: "个人中心", link: "/account" },
          { label: "设置", link: "/settings" },
          ...(role === "admin" ? [{ label: "后台", link: "/admin" }] : []),
        ]}
      />
      <aside className="drawer">{drawer}</aside>
      <header className="topbar" ref={bar}>
        <Brand />
        <button
          type="button"
          className="icon-btn nav-toggle"
          aria-expanded={navOpen}
          aria-controls="mobile-site-nav"
          aria-label={navOpen ? "收起导航" : "打开导航"}
          onClick={() => setNavOpen((open) => !open)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            {navOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        <nav className="top-nav" aria-label="主导航" ref={navRef}>
          <PillNav items={CORE} activeHref={pathname} className="desktop-pill" />
          <CardDrop label="验证实验室" items={LAB_LINKS} pathname={pathname} open={drop === "lab"} onToggle={() => setDrop(drop === "lab" ? null : "lab")} onClose={() => setDrop(null)} />
          <CardDrop label="竞赛题单" items={SANDBOX_LINKS} pathname={pathname} open={drop === "sandbox"} onToggle={() => setDrop(drop === "sandbox" ? null : "sandbox")} onClose={() => setDrop(null)} />
        </nav>
        <div className="top-meta">
          <span className="sandbox" title={`评测沙箱：${sandbox}`}>
            <span className={sandbox === "down" ? "dot down" : "dot"} />
            <span>{sandbox}</span>
          </span>
          <Link href="/account" className="user-name">
            {user}
          </Link>
          {role === "admin" ? (
            <Link href="/admin" className="btn btn-ghost btn-sm">
              后台
            </Link>
          ) : null}
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
        <span>VeriFlow · 可验证算法训练平台与 AI 出题门禁系统</span>
        <span>沙箱运行环境 · C++17 / Python3 · Docker 裁判</span>
      </footer>
    </div>
  );
}
