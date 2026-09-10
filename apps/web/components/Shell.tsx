"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, clearSession, currentUsername } from "@/lib/api";

const LINKS = [
  { href: "/", label: "训练桌" },
  { href: "/problems", label: "题库" },
  { href: "/status", label: "状态" },
  { href: "/stress", label: "对拍" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState("…");

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
  }, [router]);

  if (!user) return null;

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <strong>VERIFLOW</strong>
          <span>验流 · 夜场</span>
        </Link>
        <nav className="nav">
          {LINKS.map((link) => (
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
          <span className="dead" title="下一期">
            出题
          </span>
        </nav>
        <div className="top-meta">
          <span className={sandbox === "down" ? "dot down" : "dot"} />
          <span>{sandbox}</span>
          <span>{user}</span>
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
    </div>
  );
}
