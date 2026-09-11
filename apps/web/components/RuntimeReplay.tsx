"use client";

import { useEffect, useState } from "react";
import { effectsAllowScan, useEffects } from "@/lib/effects";

export type ReplayEvent = {
  event_index: number;
  node_id: string;
  operation: string;
  status: string;
  duration_ms: number;
  branch?: string | null;
};

export default function RuntimeReplay({
  events,
  play,
}: {
  events: ReplayEvent[];
  play: boolean;
}) {
  const { effects } = useEffects();
  const [index, setIndex] = useState(play ? 0 : events.length);
  const [playing, setPlaying] = useState(play);

  useEffect(() => {
    if (!play || !effectsAllowScan(effects)) {
      setIndex(events.length);
      setPlaying(false);
      return;
    }
    setIndex(0);
    setPlaying(true);
  }, [effects, events, play]);

  useEffect(() => {
    if (!playing || !events.length) return;
    if (index >= events.length - 1) {
      setPlaying(false);
      return;
    }
    const hold = Math.min(Math.max(events[index]?.duration_ms || 180, 120), 480);
    const id = window.setTimeout(() => setIndex((n) => n + 1), hold);
    return () => window.clearTimeout(id);
  }, [events, index, playing]);

  if (!events.length) return <p className="ghost">No recorded trace.</p>;
  const current = events[Math.min(index, events.length - 1)];
  return (
    <section className="runtime-replay">
      <header className="section-row">
        <h3>Runtime replay</h3>
        <span className="caption">
          {playing ? "playing recorded trace" : "recorded"} · {Math.min(index + 1, events.length)}/{events.length}
        </span>
      </header>
      <ol>
        {events.map((ev, i) => (
          <li key={ev.event_index} className={i === index ? "on" : i < index ? "done" : ""}>
            <span className="mono">{ev.node_id}</span>
            <span>{ev.operation}</span>
            <span>{ev.status}</span>
          </li>
        ))}
      </ol>
      <p className="caption">
        Cursor on {current.node_id}
        {current.branch ? ` · branch ${current.branch}` : ""}. This is playback of session.trace, not a re-exec.
      </p>
    </section>
  );
}
