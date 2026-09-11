"use client";

import { useEffect, useRef } from "react";

export default function Topography({
  className = "",
  opacity = 0.14,
}: {
  className?: string;
  opacity?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const resize = () => {
      const { width, height } = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = "currentColor";
      ctx.lineWidth = 1;
      const levels = 8;
      for (let i = 1; i <= levels; i++) {
        ctx.beginPath();
        for (let x = 0; x <= width; x += 4) {
          const nx = x / 90;
          const y =
            height * (i / (levels + 1)) +
            Math.sin(nx + i * 0.7) * 18 +
            Math.sin(nx * 0.35 + i) * 28;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [opacity]);

  return (
    <div ref={wrapRef} className={className} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
