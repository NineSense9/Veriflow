"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

export type PointerSnapshot = {
  x: number;
  y: number;
  nx: number;
  ny: number;
  vx: number;
  vy: number;
  down: boolean;
  lastClickX: number;
  lastClickY: number;
  lastClickTime: number;
  w: number;
  h: number;
  pointerType: string;
};

const EMPTY: PointerSnapshot = {
  x: 0,
  y: 0,
  nx: 0.5,
  ny: 0.5,
  vx: 0,
  vy: 0,
  down: false,
  lastClickX: 0,
  lastClickY: 0,
  lastClickTime: 0,
  w: 1,
  h: 1,
  pointerType: "mouse",
};

const pointer: PointerSnapshot = { ...EMPTY };
const listeners = new Set<() => void>();
let raf = 0;
let pending = false;

function flush() {
  raf = 0;
  pending = false;
  listeners.forEach((fn) => fn());
}

function schedule() {
  if (pending) return;
  pending = true;
  raf = requestAnimationFrame(flush);
}

function onMove(e: PointerEvent) {
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  const nx = e.clientX / w;
  const ny = e.clientY / h;
  pointer.vx = e.clientX - pointer.x;
  pointer.vy = e.clientY - pointer.y;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.nx = nx;
  pointer.ny = ny;
  pointer.w = w;
  pointer.h = h;
  pointer.pointerType = e.pointerType || "mouse";
  schedule();
}

function onDown(e: PointerEvent) {
  pointer.down = true;
  pointer.lastClickX = e.clientX;
  pointer.lastClickY = e.clientY;
  pointer.lastClickTime = performance.now();
  onMove(e);
}

function onUp() {
  pointer.down = false;
  schedule();
}

export function getPointer(): PointerSnapshot {
  return pointer;
}

export function subscribePointer(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const Ctx = createContext<{ getPointer: () => PointerSnapshot }>({ getPointer });

export function PointerFXProvider({ children }: { children: ReactNode }) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    const debug = new URLSearchParams(window.location.search).get("debugFx") === "1";
    let overlay: HTMLDivElement | null = null;
    let stopDebug: (() => void) | null = null;
    if (debug) {
      overlay = document.createElement("div");
      overlay.className = "fx-debug";
      overlay.style.cssText =
        "position:fixed;left:8px;bottom:8px;z-index:9999;font:11px/1.3 var(--font-mono,monospace);background:var(--fx-surface);color:var(--fx-fg);border:1px solid var(--fx-line);padding:6px 8px;pointer-events:none";
      document.body.appendChild(overlay);
      stopDebug = subscribePointer(() => {
        if (!overlay) return;
        overlay.textContent = `x ${pointer.x.toFixed(0)} y ${pointer.y.toFixed(0)} nx ${pointer.nx.toFixed(2)} ny ${pointer.ny.toFixed(2)}`;
      });
    }
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      if (raf) cancelAnimationFrame(raf);
      stopDebug?.();
      overlay?.remove();
    };
  }, []);
  return <Ctx.Provider value={{ getPointer }}>{children}</Ctx.Provider>;
}

export function usePointerFX() {
  return useContext(Ctx);
}
