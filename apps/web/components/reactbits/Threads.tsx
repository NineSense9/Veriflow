"use client";

import React, { useEffect, useRef } from "react";
import "./Threads.css";

interface ThreadsProps {
  color?: [number, number, number];
  amplitude?: number;
  distance?: number;
  enableMouseInteraction?: boolean;
  className?: string;
}

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function noise2(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const n00 = hash(xi * 13 + yi * 47);
  const n10 = hash((xi + 1) * 13 + yi * 47);
  const n01 = hash(xi * 13 + (yi + 1) * 47);
  const n11 = hash((xi + 1) * 13 + (yi + 1) * 47);
  return n00 * (1 - u) * (1 - v) + n10 * u * (1 - v) + n01 * (1 - u) * v + n11 * u * v;
}

const Threads: React.FC<ThreadsProps> = ({
  color = [15 / 255, 118 / 255, 110 / 255],
  amplitude = 1,
  distance = 0,
  enableMouseInteraction = true,
  className = "",
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: 0.5, y: 0.5 });
  const hidden = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let t0 = performance.now();

    const resize = () => {
      const { width, height } = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, width * dpr);
      canvas.height = Math.max(1, height * dpr);
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
        const time = (now - t0) / 1000;
        const lines = 36;
        ctx.lineWidth = 1.1;
        for (let i = 0; i < lines; i++) {
          const perc = i / lines;
          ctx.beginPath();
          ctx.strokeStyle = `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${0.12 + perc * 0.35})`;
          for (let x = 0; x <= width; x += 6) {
            const st = x / width;
            const split = 0.1 + perc * 0.4;
            const ampN = st > split ? (st - split) / (1 - split) : 0;
            const mouseAmp = 1 + (mouse.current.y - 0.5) * 0.25;
            const timeScaled = time / 8 + (mouse.current.x - 0.5);
            const n =
              noise2(timeScaled * 2.5, st + perc) * 0.65 +
              noise2(timeScaled * 3.5, st + timeScaled) * 0.35 * st;
            const y =
              height * (0.18 + perc * (0.64 + distance * 0.08)) +
              (n - 0.5) * height * 0.22 * amplitude * ampN * mouseAmp;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const onMove = (e: PointerEvent) => {
      if (!enableMouseInteraction) return;
      const r = wrap.getBoundingClientRect();
      mouse.current = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };
    wrap.addEventListener("pointermove", onMove);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      wrap.removeEventListener("pointermove", onMove);
    };
  }, [amplitude, color, distance, enableMouseInteraction]);

  return (
    <div ref={wrapRef} className={`threads-container ${className}`}>
      <canvas ref={canvasRef} />
    </div>
  );
};

export default Threads;
