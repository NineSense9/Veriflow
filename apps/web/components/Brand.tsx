"use client";

import Link from "next/link";

export default function Brand({ href = "/" }: { href?: string | null }) {
  const inner = (
    <>
      <span className="brand-mark" aria-hidden="true">
        V
      </span>
      <span className="brand-text">
        <strong>VeriFlow</strong>
        <span>verification</span>
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
