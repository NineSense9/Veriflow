"use client";

import { useEffect, useState } from "react";
import { effectsAllowScan, useEffects } from "@/lib/effects";
import { useVisibleMotion } from "@/lib/use-visible-motion";
import { Play, Pause, RotateCcw } from "lucide-react";

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
  selectedEventIndices = [],
  selectionKey = "",
}: {
  events: ReplayEvent[];
  play: boolean;
  selectedEventIndices?: number[];
  selectionKey?: string;
}) {
  const { effects } = useEffects();
  const [index, setIndex] = useState(play ? 0 : events.length);
  const [playing, setPlaying] = useState(play);
  const { ref, visible } = useVisibleMotion();
  const relatedKey = selectedEventIndices.join(",");

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
    if (!selectionKey) return;
    const related = relatedKey.split(",").filter(Boolean).map(Number);
    if (!related.length) {
      setIndex(events.length);
      setPlaying(false);
      return;
    }
    const last = Math.max(
      ...related.map((eventIndex) => events.findIndex((event) => event.event_index === eventIndex)).filter((i) => i >= 0),
      -1,
    );
    setIndex(last < 0 ? events.length : last);
    setPlaying(false);
  }, [selectionKey, events, relatedKey]);

  useEffect(() => {
    if (!playing || !events.length || !visible || !effectsAllowScan(effects)) return;
    if (index >= events.length - 1) {
      setPlaying(false);
      return;
    }
    const hold = Math.min(Math.max(events[index]?.duration_ms || 180, 120), 480);
    const id = window.setTimeout(() => setIndex((n) => n + 1), hold);
    return () => window.clearTimeout(id);
  }, [events, index, playing, visible, effects]);

  if (!events.length) return <div ref={ref}><p className="ghost">本次记录没有运行事件。</p></div>;
  const current = events[Math.min(index, events.length - 1)];
  return (
    <div ref={ref} className="runtime-replay">
      <header className="section-row">
        <h3>运行轨迹</h3>
        <span className="caption">
          {playing ? "回放中" : "已记录"} · {events.length} 个事件
        </span>
        <div className="vf-replay-controls">
          <button type="button" className="icon-btn" title={playing ? "暂停回放" : "回放记录"} aria-label={playing ? "暂停回放" : "回放记录"} disabled={!effectsAllowScan(effects)} onClick={() => { if (!playing && index >= events.length - 1) setIndex(0); setPlaying(!playing); }}>{playing ? <Pause size={13} /> : <Play size={13} />}</button>
          <button type="button" className="icon-btn" title="回到首个事件" aria-label="回到首个事件" onClick={() => { setPlaying(false); setIndex(0); }}><RotateCcw size={13} /></button>
        </div>
      </header>
      <ol>
        {events.map((ev, i) => (
          <li key={ev.event_index} data-related={selectedEventIndices.includes(ev.event_index) ? "true" : undefined} className={i === index ? "on" : i < index ? "done" : ""}>
            <button type="button" aria-label={`事件 ${ev.event_index}: ${ev.node_id}`} aria-pressed={i === index} onClick={() => { setPlaying(false); setIndex(i); }}><span className="mono">{ev.node_id}</span><span>{ev.status}</span></button>
          </li>
        ))}
      </ol>
      <p className="caption">
        {selectedEventIndices.length
          ? `当前问题相关轨迹停在 ${current.node_id}${current.branch ? ` · ${current.branch}` : ""} · ${selectedEventIndices.length} 个相关事件`
          : selectionKey
            ? "当前问题在轨迹中没有对应事件（约束要求发生，但记录里没有）"
            : `当前 ${current.node_id}${current.branch ? ` · ${current.branch}` : ""} · 记录回放`}
      </p>
    </div>
  );
}
