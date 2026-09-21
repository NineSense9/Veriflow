"use client";

import Link from "next/link";

export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="VeriFlow"
      className={className}
      width={28}
      height={28}
      style={{
        objectFit: "cover",
        borderRadius: "6px",
        display: "block",
        flexShrink: 0,
      }}
    />
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
