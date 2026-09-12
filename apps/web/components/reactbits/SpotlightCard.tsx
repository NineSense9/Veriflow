"use client";

import React, { useEffect, useRef } from "react";
import { effectsAllowPointer, useEffects } from "@/lib/effects";
import "./SpotlightCard.css";

interface SpotlightCardProps extends React.PropsWithChildren {
  className?: string;
  spotlightColor?: `rgba(${number}, ${number}, ${number}, ${number})`;
}

const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  className = "",
  spotlightColor = "rgba(15, 118, 110, 0.22)",
}) => {
  const divRef = useRef<HTMLDivElement>(null);
  const { effects } = useEffects();
  const interactive = effectsAllowPointer(effects);
  const enabled = interactive || effects === "balanced";
  useEffect(() => {
    if (!interactive && divRef.current) {
      divRef.current.style.setProperty("--mouse-x", "50%");
      divRef.current.style.setProperty("--mouse-y", "50%");
    }
  }, [interactive]);

  const handleMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    divRef.current.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
    divRef.current.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
    divRef.current.style.setProperty("--spotlight-color", spotlightColor);
  };

  return (
    <div ref={divRef} onMouseMove={interactive ? handleMouseMove : undefined} data-spotlight={enabled ? "on" : "off"} data-pointer={interactive ? "on" : "off"} className={`card-spotlight ${className}`}>
      {children}
    </div>
  );
};

export default SpotlightCard;
