"use client";

import React, { useEffect, useRef } from "react";
import "./ChromaGrid.css";
import { effectsAllowPointer, useEffects } from "@/lib/effects";

export interface ChromaItem {
  image?: string;
  title: string;
  subtitle: string;
  handle?: string;
  location?: string;
  borderColor?: string;
  gradient?: string;
  url?: string;
  badge?: string;
}

export interface ChromaGridProps {
  items?: ChromaItem[];
  className?: string;
  radius?: number;
  columns?: number;
  rows?: number;
  damping?: number;
  fadeOut?: number;
}

export const ChromaGrid: React.FC<ChromaGridProps> = ({
  items = [],
  className = "",
  radius = 300,
  columns = 3,
  rows = 2,
  damping = 0.18,
  fadeOut = 0.6,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const target = useRef({ x: 0, y: 0 });
  const raf = useRef(0);
  const { effects } = useEffects();
  const interactive = effectsAllowPointer(effects);
  useEffect(() => {
    if (!interactive && raf.current) { cancelAnimationFrame(raf.current); raf.current = 0; }
    return () => { if (raf.current) cancelAnimationFrame(raf.current); raf.current = 0; };
  }, [interactive]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    pos.current = { x: width / 2, y: height / 2 };
    target.current = { ...pos.current };
    el.style.setProperty("--x", `${pos.current.x}px`);
    el.style.setProperty("--y", `${pos.current.y}px`);
  }, []);

  const tick = () => {
    const el = rootRef.current;
    if (!el) return;
    const dx = target.current.x - pos.current.x;
    const dy = target.current.y - pos.current.y;
    pos.current.x += dx * damping;
    pos.current.y += dy * damping;
    el.style.setProperty("--x", `${pos.current.x}px`);
    el.style.setProperty("--y", `${pos.current.y}px`);
    if (Math.abs(dx) + Math.abs(dy) > 0.4) {
      raf.current = requestAnimationFrame(tick);
    } else {
      raf.current = 0;
    }
  };

  const moveTo = (x: number, y: number) => {
    target.current = { x, y };
    if (!raf.current) raf.current = requestAnimationFrame(tick);
  };

  const handleMove = (e: React.PointerEvent) => {
    const r = rootRef.current!.getBoundingClientRect();
    moveTo(e.clientX - r.left, e.clientY - r.top);
    if (fadeRef.current) fadeRef.current.style.opacity = "0";
  };

  const handleLeave = () => {
    if (fadeRef.current) {
      fadeRef.current.style.transition = `opacity ${fadeOut}s ease`;
      fadeRef.current.style.opacity = "1";
    }
  };

  const handleCardMove: React.MouseEventHandler<HTMLElement> = (e) => {
    const card = e.currentTarget as HTMLElement;
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
    card.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
  };

  return (
    <div
      ref={rootRef}
      className={`chroma-grid ${className}`}
      style={
        {
          "--r": `${radius}px`,
          "--cols": columns,
          "--rows": rows,
        } as React.CSSProperties
      }
      onPointerMove={interactive ? handleMove : undefined}
      onPointerLeave={handleLeave}
    >
      {items.map((c, i) => (
        <article
          key={`${c.title}-${i}`}
          className="chroma-card"
          onMouseMove={interactive ? handleCardMove : undefined}
          tabIndex={c.url ? 0 : undefined}
          role={c.url ? "link" : undefined}
          onKeyDown={(event) => {
            if (c.url && event.key === "Enter") window.open(c.url, "_blank", "noopener,noreferrer");
          }}
          onClick={() => {
            if (c.url) window.open(c.url, "_blank", "noopener,noreferrer");
          }}
          style={
            {
              "--card-border": c.borderColor || "transparent",
              "--card-gradient": c.gradient,
              cursor: c.url ? "pointer" : "default",
            } as React.CSSProperties
          }
        >
          {c.image ? (
            <div className="chroma-img-wrapper">
              <img src={c.image} alt={c.title} loading="lazy" />
            </div>
          ) : (
            <div className="chroma-badge">{c.badge || c.handle || c.title.slice(0, 2)}</div>
          )}
          <footer className="chroma-info">
            <h3 className="name">{c.title}</h3>
            {c.handle ? <span className="handle">{c.handle}</span> : null}
            <p className="role">{c.subtitle}</p>
            {c.location ? <span className="location">{c.location}</span> : null}
          </footer>
        </article>
      ))}
      {interactive ? <><div className="chroma-overlay" /><div ref={fadeRef} className="chroma-fade" /></> : null}
    </div>
  );
};

export default ChromaGrid;
