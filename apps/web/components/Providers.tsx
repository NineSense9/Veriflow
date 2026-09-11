"use client";

import AmbientBackground from "@/components/AmbientBackground";
import { EffectsProvider } from "@/lib/effects";
import type { ReactNode } from "react";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <EffectsProvider>
      <AmbientBackground />
      {children}
    </EffectsProvider>
  );
}
