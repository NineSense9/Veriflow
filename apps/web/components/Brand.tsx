"use client";

import Link from "next/link";

export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="7" fill="currentColor" className="brand-mark-fill" />
      <path
        d="M8 8.5 L16 23.5 L24 8.5"
        fill="none"
        stroke="var(--logo-fg)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8.5" r="2.1" fill="var(--logo-fg)" />
      <circle cx="24" cy="8.5" r="2.1" fill="var(--logo-fg)" />
      <circle cx="16" cy="23.5" r="2.4" fill="var(--logo-fg)" />
    </svg>
  );
}

export default function Brand({ href = "/" }: { href?: string | null }) {
  const inner = (
    <>
      <BrandMark />
      <span className="brand-text">
        <strong>VeriFlow</strong>
        <span>AI 工作流验证</span>
      </span>
    </>
  );
  if (!href) {
    return <span className="brand">{inner}</span>;
  }
  return (
    <Link href={href} className="brand" aria-label="VeriFlow">
      {inner}
    </Link>
  );
}
