"use client";

import { useEffect, useRef } from "react";
import { useEffects } from "@/lib/effects";

export default function Topography({
  className = "",
  opacity = 0.14,
}: {
  className?: string;
  opacity?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { effects } = useEffects();

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    if (effects === "off") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let start = performance.now();
    const drift = effects === "full" || effects === "balanced";
    const period = 16000;

    const paint = (phase: number) => {
      const { width, height } = wrap.getBoundingClientRect();
      if (width < 2 || height < 2) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const css = getComputedStyle(document.documentElement);
      const line = css.getPropertyValue("--fx-topography-line").trim() || "currentColor";
      const op = parseFloat(css.getPropertyValue("--fx-topography-opacity")) || opacity;
      ctx.globalAlpha = op;
      ctx.strokeStyle = line;
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      ctx.lineWidth = dark ? 1.15 : 0.9;
      const levels = dark ? 12 : 10;
      for (let i = 1; i <= levels; i++) {
        ctx.beginPath();
        for (let x = 0; x <= width; x += 4) {
          const nx = x / 90;
          const y =
            height * (i / (levels + 1)) +
            Math.sin(nx + i * 0.7 + phase) * 18 +
            Math.sin(nx * 0.35 + i + phase * 0.6) * 22;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      const fade = ctx.createLinearGradient(0, 0, 0, height);
      fade.addColorStop(0, "rgba(0,0,0,0)"); // mask compositing only
      fade.addColorStop(0.12, "rgba(0,0,0,1)");
      fade.addColorStop(0.88, "rgba(0,0,0,1)");
      fade.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalCompositeOperation = "destination-in";
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
    };

    const tick = (now: number) => {
      if (document.hidden) return;
      const phase = ((now - start) / period) * Math.PI * 2;
      paint(phase);
      if (drift) raf = requestAnimationFrame(tick);
    };

    const onVis = () => {
      if (!document.hidden && drift) raf = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", onVis);

    if (drift) raf = requestAnimationFrame(tick);
    else paint(0);

    const ro = new ResizeObserver(() => {
      if (!drift) paint(0);
    });
    ro.observe(wrap);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      ro.disconnect();
    };
  }, [effects, opacity]);

  if (effects === "off") return null;
  return (
    <div ref={wrapRef} className={className} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
