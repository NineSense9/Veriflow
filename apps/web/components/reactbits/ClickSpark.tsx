"use client";

/** Adapted from React Bits ClickSpark (https://reactbits.dev) MIT. Global burst, not per-button canvas. */

import { useEffect } from "react";
import { effectsAllowPointer, useEffects } from "@/lib/effects";

const SKIP = new Set(["INPUT", "TEXTAREA", "SELECT"]);
let live = 0;
const MAX = 4;

function ink(dark: boolean) {
  return dark ? "rgba(45,212,191,0.85)" : "rgba(15,118,110,0.75)";
}

function spark(x: number, y: number, strong: boolean, dark: boolean) {
  if (live >= MAX) return;
  live += 1;
  const n = strong ? 10 : 7;
  const root = document.createElement("div");
  root.className = "vf-click-spark";
  root.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:0;height:0;pointer-events:none;z-index:80`;
  const color = ink(dark);
  for (let i = 0; i < n; i++) {
    const ray = document.createElement("span");
    const ang = (Math.PI * 2 * i) / n + Math.random() * 0.2;
    const dist = (strong ? 22 : 14) + Math.random() * 10;
    ray.style.cssText = `position:absolute;left:0;top:0;width:${strong ? 10 : 7}px;height:1px;background:${color};transform:rotate(${ang}rad);transform-origin:0 50%;opacity:1;transition:transform 200ms ease,opacity 220ms ease`;
    root.appendChild(ray);
    requestAnimationFrame(() => {
      ray.style.transform = `rotate(${ang}rad) translateX(${dist}px)`;
      ray.style.opacity = "0";
    });
  }
  document.body.appendChild(root);
  window.setTimeout(() => {
    root.remove();
    live -= 1;
  }, 260);
}

function ripple(x: number, y: number, dark: boolean) {
  if (live >= MAX) return;
  live += 1;
  const root = document.createElement("div");
  root.className = "vf-click-ripple";
  root.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;border:1px solid ${ink(dark)};pointer-events:none;z-index:80;opacity:0.65;transform:scale(1);transition:transform 140ms ease,opacity 140ms ease`;
  document.body.appendChild(root);
  requestAnimationFrame(() => {
    root.style.transform = "scale(2.6)";
    root.style.opacity = "0";
  });
  window.setTimeout(() => {
    root.remove();
    live -= 1;
  }, 160);
}

export default function GlobalClickFX() {
  const { effects } = useEffects();
  useEffect(() => {
    if (effects === "off") return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (SKIP.has((t.closest("input,textarea,select,[contenteditable='true'],.monaco-editor") || t).tagName)) return;
      const hit = t.closest("button, a[href], [data-click-fx], [role='button'], .magic-bento-card") as HTMLElement | null;
      if (!hit) return;
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      if (effects === "reduced") {
        ripple(e.clientX, e.clientY, dark);
        return;
      }
      const strong = hit.getAttribute("data-click-fx") === "strong";
      spark(e.clientX, e.clientY, strong && effectsAllowPointer(effects), dark);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [effects]);
  return null;
}
