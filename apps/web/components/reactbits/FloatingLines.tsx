"use client";

/** VeriFlow compose ambient. Inspired by React Bits free linear backgrounds (MIT). */

import { useEffect, useRef } from "react";
import { getPointer } from "@/lib/pointer-fx";

export default function FloatingLines({
  intensity = 0.35,
  pointer = true,
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
      const t = now / 4000;
      ctx.lineWidth = 1;
      for (let i = 0; i < 18; i++) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(15,118,110,${0.06 + intensity * 0.18})`;
        const y0 = ((i / 18 + t * 0.04) % 1) * height;
        ctx.moveTo(0, y0 + Math.sin(t + i) * 8);
        ctx.quadraticCurveTo(width * p.nx, y0 + (p.ny - 0.5) * 40, width, y0 + Math.cos(t + i) * 8);
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
