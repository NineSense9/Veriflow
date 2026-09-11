"use client";

import { useEffect, useRef } from "react";

export default function LightRays({
  className = "",
  color = "15, 118, 110",
}: {
  className?: string;
  color?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hidden = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const resize = () => {
      const { width, height } = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const onVis = () => {
      hidden.current = document.hidden;
    };
    document.addEventListener("visibilitychange", onVis);
    const draw = (now: number) => {
      const { width, height } = wrap.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      if (!hidden.current) {
        const t = now / 4000;
        const originX = width * 0.2;
        const originY = -height * 0.1;
        for (let i = 0; i < 10; i++) {
          const a = -0.2 + i * 0.12 + Math.sin(t + i) * 0.03;
          const len = height * 1.4;
          ctx.beginPath();
          ctx.moveTo(originX, originY);
          ctx.lineTo(originX + Math.cos(a) * len, originY + Math.sin(a + 1.2) * len);
          ctx.strokeStyle = `rgba(${color}, ${0.04 + (i % 3) * 0.03})`;
          ctx.lineWidth = 48;
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [color]);

  return (
    <div ref={wrapRef} className={className} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
