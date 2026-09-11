"use client";

import Link from "next/link";
import "./CardNav.css";

export type CardNavLink = { label: string; href: string; description: string };

export type CardNavItem = { label: string; links: CardNavLink[] };

export default function CardNav({
  open,
  items,
  onClose,
}: {
  open: boolean;
  items: CardNavItem[];
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="vf-card-nav-panel card-nav-content" role="menu">
      {items.map((group) => (
        <article key={group.label} className="nav-card" style={{ background: "var(--fx-surface-elevated)", color: "var(--fx-fg)" }}>
          <p className="nav-card-label">{group.label}</p>
          <div className="nav-card-links">
            {group.links.map((link, index) => (
              <Link
                key={link.href}
                href={link.href}
                role="menuitem"
                onClick={onClose}
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <strong>{link.label}</strong>
                <span>{link.description}</span>
              </Link>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
