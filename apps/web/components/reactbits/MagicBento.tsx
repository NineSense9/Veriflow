"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { effectsAllowPointer, useEffects } from "@/lib/effects";
import "./MagicBento.css";

export interface BentoCardProps {
  color?: string;
  title?: string;
  description?: string;
  label?: string;
  href?: string;
}

export interface BentoProps {
  cards?: BentoCardProps[];
  children?: React.ReactNode;
  textAutoHide?: boolean;
  enableSpotlight?: boolean;
  enableBorderGlow?: boolean;
  disableAnimations?: boolean;
  spotlightRadius?: number;
  glowColor?: string;
  className?: string;
  gridClassName?: string;
}

const DEFAULT_SPOTLIGHT_RADIUS = 280;
const DEFAULT_GLOW_COLOR = "15, 118, 110";

const MagicBento: React.FC<BentoProps> = ({
  cards,
  children,
  enableSpotlight = true,
  enableBorderGlow = true,
  disableAnimations = false,
  spotlightRadius = DEFAULT_SPOTLIGHT_RADIUS,
  glowColor = DEFAULT_GLOW_COLOR,
  className = "",
  gridClassName = "",
}) => {
  const { effects } = useEffects();
  const interactive = !disableAnimations && effectsAllowPointer(effects);
  const gridRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive || !gridRef.current || e.pointerType === "touch") return;
      const root = gridRef.current;
      const rect = root.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (spotRef.current) {
        spotRef.current.style.background = `radial-gradient(circle ${spotlightRadius}px at ${x}px ${y}px, rgba(${glowColor}, 0.16), transparent 70%)`;
      }
      root.querySelectorAll<HTMLElement>(".magic-bento-card").forEach((card) => {
        if (card.classList.contains("card-spotlight")) return;
        const cr = card.getBoundingClientRect();
        const cx = ((e.clientX - cr.left) / cr.width) * 100;
        const cy = ((e.clientY - cr.top) / cr.height) * 100;
        const dx = e.clientX - (cr.left + cr.width / 2);
        const dy = e.clientY - (cr.top + cr.height / 2);
        const dist = Math.hypot(dx, dy);
        const glow = dist < spotlightRadius ? 1 - dist / spotlightRadius : 0;
        card.style.setProperty("--glow-x", `${cx}%`);
        card.style.setProperty("--glow-y", `${cy}%`);
        card.style.setProperty("--glow-intensity", glow.toFixed(3));
        card.style.setProperty("--glow-radius", `${spotlightRadius}px`);
      });
    },
    [interactive, glowColor, spotlightRadius],
  );

  const onLeave = () => {
    gridRef.current?.querySelectorAll<HTMLElement>(".magic-bento-card").forEach((card) => {
      card.style.transform = "";
      card.style.setProperty("--glow-intensity", "0");
    });
    if (spotRef.current) spotRef.current.style.background = "transparent";
  };

  useEffect(() => { if (!interactive) onLeave(); }, [interactive]);

  return (
    <div
      ref={gridRef}
      className={`vf-bento-root ${className}`}
      style={{ position: "relative" }}
      onPointerMove={interactive ? onMove : undefined}
      onPointerLeave={onLeave}
    >
      {enableSpotlight && interactive ? (
        <div
          ref={spotRef}
          aria-hidden="true"
          className="vf-bento-spot"
          style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}
        />
      ) : null}
      <div className={`card-grid ${gridClassName}`} data-border-glow={enableBorderGlow && interactive ? "true" : undefined}>
      {children
        ? children
        : (cards || []).map((card) => {
            const inner = (
              <>
                <div className="magic-bento-card__header">
                  <span className="magic-bento-card__label">{card.label}</span>
                </div>
                <div className="magic-bento-card__content">
                  <h3 className="magic-bento-card__title">{card.title}</h3>
                  <p className="magic-bento-card__description">{card.description}</p>
                </div>
              </>
            );
            const cls = `magic-bento-card ${enableBorderGlow ? "magic-bento-card--border-glow" : ""}`;
            const style = { background: card.color || "var(--fx-surface)" };
            return card.href ? (
              <a key={card.title} href={card.href} className={cls} style={style}>
                {inner}
              </a>
            ) : (
              <article key={card.title} className={cls} style={style}>
                {inner}
              </article>
            );
          })}
      </div>
    </div>
  );
};

export default MagicBento;
