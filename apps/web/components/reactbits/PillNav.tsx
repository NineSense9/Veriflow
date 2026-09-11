"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import "./PillNav.css";

export type PillNavItem = { label: string; href: string; ariaLabel?: string };

export default function PillNav({
  items,
  activeHref,
  className = "",
}: {
  items: PillNavItem[];
  activeHref?: string;
  className?: string;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const root = listRef.current;
    const bar = indicator.current;
    if (!root || !bar) return;
    const active = root.querySelector("a.active") as HTMLElement | null;
    if (!active) {
      bar.style.opacity = "0";
      return;
    }
    const box = root.getBoundingClientRect();
    const hit = active.getBoundingClientRect();
    bar.style.opacity = "1";
    bar.style.width = `${hit.width}px`;
    bar.style.transform = `translateX(${hit.left - box.left}px)`;
  }, [activeHref, items]);

  return (
    <nav className={`pill-nav vf-pill-nav ${className}`} aria-label="主导航">
      <div className="pill-nav-items">
        <ul className="pill-list" ref={listRef}>
          <span className="vf-pill-indicator" ref={indicator} aria-hidden="true" />
          {items.map((item) => {
            const active = activeHref === item.href || (item.href !== "/" && (activeHref || "").startsWith(item.href));
            const home = item.href === "/" && activeHref === "/";
            const on = item.href === "/" ? home : active;
            return (
              <li key={item.href}>
                <Link className={`pill ${on ? "active" : ""}`} href={item.href} aria-current={on ? "page" : undefined} aria-label={item.ariaLabel || item.label}>
                  <span className="pill-label">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
