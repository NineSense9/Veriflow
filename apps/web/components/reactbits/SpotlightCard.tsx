"use client";

import React, { useRef } from "react";
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

  const handleMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    divRef.current.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
    divRef.current.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
    divRef.current.style.setProperty("--spotlight-color", spotlightColor);
  };

  return (
    <div ref={divRef} onMouseMove={interactive ? handleMouseMove : undefined} data-spotlight={interactive ? "on" : "off"} className={`card-spotlight ${className}`}>
      {children}
    </div>
  );
};

export default SpotlightCard;
