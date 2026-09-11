"use client";

import { EffectsProvider } from "@/lib/effects";
import type { ReactNode } from "react";

export default function Providers({ children }: { children: ReactNode }) {
  return <EffectsProvider>{children}</EffectsProvider>;
}
