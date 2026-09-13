"use client";

import Link from "next/link";
import { useEffect } from "react";
import "./StaggeredMenu.css";

export type StaggeredMenuItem = { label: string; link: string; ariaLabel?: string };

export default function StaggeredMenu({
  open,
  items,
  onClose,
}: {
  open: boolean;
  items: StaggeredMenuItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="staggered-menu-wrapper vf-staggered" data-open="true">
      <button type="button" className="nav-scrim" aria-label="关闭菜单" onClick={onClose} />
      <aside id="mobile-site-nav" className="sm-panel" aria-label="移动导航" style={{ overflowY: "auto", maxHeight: "calc(100dvh - var(--topbar-h))" }}>
        <ul className="sm-panel-list">
          {items.map((item, index) => (
            <li key={item.link} className="sm-panel-itemWrap" style={{ animationDelay: `${30 + index * 40}ms` }}>
              <Link className="sm-panel-item" href={item.link} aria-label={item.ariaLabel || item.label} onClick={onClose}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
