"use client";

import { useState } from "react";

export default function CopyButton({
  text,
  label = "复制",
}: {
  text: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      className="copy-btn"
      aria-label={done ? "已复制" : label}
      title={done ? "已复制" : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard may be blocked */
        }
      }}
    >
      {done ? "已复制" : "复制"}
    </button>
  );
}
