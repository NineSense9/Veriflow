"use client";

import Link from "next/link";
import { ArrowUpRight, Braces, Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import { effectsAllowPointer, useEffects } from "@/lib/effects";
import "./ChromaGrid.css";

export interface ChromaItem { image?: string; title: string; subtitle: string; handle?: string; location?: string; borderColor?: string; gradient?: string; url?: string; badge?: string; }
export interface ChromaGridProps { items?: ChromaItem[]; className?: string; radius?: number; columns?: number; rows?: number; damping?: number; fadeOut?: number; }

export default function ChromaGrid({ items = [], className = "", columns = 3 }: ChromaGridProps) {
  const { effects } = useEffects();
  return <div className={`chroma-grid ${className}`} style={{ "--cols": columns } as CSSProperties} data-effects={effects}>
    {items.map((item) => <article className="chroma-card" key={item.handle || item.title}
      style={{ "--card-border": item.borderColor || "var(--accent)" } as CSSProperties}
      onPointerMove={effectsAllowPointer(effects) ? event => {
        if (event.pointerType === "touch") return;
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
        event.currentTarget.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
      } : undefined}>
      {item.image ? <div className="chroma-img-wrapper"><img src={item.image} alt={item.title} loading="lazy" /></div> :
        <div className="chroma-badge">{item.badge === "AI" ? <Sparkles size={17} /> : <Braces size={17} />}<span>{item.badge || "DET"}</span></div>}
      <div className="chroma-info">
        <span className="handle">{item.handle}</span>
        <h2 className="name">{item.url ? <Link href={item.url}>{item.title}<ArrowUpRight size={15} /></Link> : item.title}</h2>
        <p className="role">{item.subtitle}</p>
        {item.location ? <p className="location">{item.location}</p> : null}
      </div>
    </article>)}
  </div>;
}
