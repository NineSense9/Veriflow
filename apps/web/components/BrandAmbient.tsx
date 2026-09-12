"use client";

import dynamic from "next/dynamic";
import { effectsAllowBackground, effectsAllowPointer, useEffects } from "@/lib/effects";
import { useVisibleMotion } from "@/lib/use-visible-motion";

const LightRays = dynamic(() => import("@/components/reactbits/LightRays"), { ssr: false });
const FloatingLines = dynamic(() => import("@/components/reactbits/FloatingLines"), { ssr: false });

export default function BrandAmbient({ variant = "lines", className = "" }: {
  variant?: "rays" | "lines";
  className?: string;
}) {
  const { effects } = useEffects();
  const { ref, visible } = useVisibleMotion();
  return (
    <div ref={ref} className={`brand-ambient ${className}`} aria-hidden="true"
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", borderRadius: "inherit" }}>
      {visible && effectsAllowBackground(effects) ? variant === "rays"
        ? <LightRays />
        : <FloatingLines intensity={0.24} pointer={effectsAllowPointer(effects)} /> : null}
    </div>
  );
}
