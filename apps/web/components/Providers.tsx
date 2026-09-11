"use client";

import AmbientBackground from "@/components/AmbientBackground";
import GlobalClickFX from "@/components/reactbits/ClickSpark";
import { EffectsProvider } from "@/lib/effects";
import { PointerFXProvider } from "@/lib/pointer-fx";
import type { ReactNode } from "react";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <EffectsProvider>
      <PointerFXProvider>
        <AmbientBackground />
        <GlobalClickFX />
        {children}
      </PointerFXProvider>
    </EffectsProvider>
  );
}
