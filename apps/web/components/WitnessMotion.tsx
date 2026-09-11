"use client";

import { useEffect, useState } from "react";
import { effectsAllowScan, useEffects } from "@/lib/effects";

export default function WitnessMotion({
  path,
  play,
  durationMs = 900,
}: {
  path: string[];
  play: boolean;
  durationMs?: number;
}) {
  const { effects } = useEffects();
  const [cursor, setCursor] = useState(-1);

  useEffect(() => {
    if (!play || !path.length || !effectsAllowScan(effects)) {
      setCursor(-1);
      return;
    }
    setCursor(0);
    const step = Math.max(120, durationMs / path.length);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      if (i >= path.length) {
        setCursor(path.length - 1);
        window.clearInterval(id);
        return;
      }
      setCursor(i);
    }, step);
    return () => window.clearInterval(id);
  }, [durationMs, effects, path, play]);

  if (!path.length) return null;
  const current = cursor >= 0 ? path[cursor] : null;
  return (
    <ol className="witness-motion" data-playing={play ? "1" : "0"}>
      {path.map((id, index) => (
        <li key={`${id}-${index}`} className={index === cursor ? "on" : index < cursor ? "done" : ""}>
          <span>{id}</span>
          {current === id && play ? <em>scan</em> : null}
        </li>
      ))}
    </ol>
  );
}
