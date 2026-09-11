"use client";

/** VeriFlow algorithms/benchmark ambient. Inspired by React Bits free grid fields (MIT). */

import { useEffect, useRef } from "react";
import { getPointer } from "@/lib/pointer-fx";

export default function RippleGrid({
  intensity = 0.2,
  pointer = false,
  className = "",
}: {
  intensity?: number;
  pointer?: boolean;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const resize = () => {
      const { width, height } = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, width * dpr);
      canvas.height = Math.max(1, height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const draw = (now: number) => {
      if (document.hidden) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const { width, height } = wrap.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      const p = pointer ? getPointer() : { nx: 0.5, ny: 0.5 };
      const cx = width * p.nx;
      const cy = height * p.ny;
      const t = now / 1800;
      ctx.strokeStyle = `rgba(15,118,110,${0.07 + intensity * 0.2})`;
      ctx.lineWidth = 1;
      for (let i = 1; i <= 8; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (i * 42 + (t * 30) % 42), 0, Math.PI * 2);
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [intensity, pointer]);

  return (
    <div ref={wrapRef} className={className} aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
