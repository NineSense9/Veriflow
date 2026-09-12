"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEventHandler,
  type ReactNode,
  type UIEvent,
} from "react";
import { motion, useInView } from "motion/react";
import "./AnimatedList.css";
import { effectsAllowBackground, useEffects } from "@/lib/effects";

interface AnimatedItemProps {
  children: ReactNode;
  delay?: number;
  index: number;
  onMouseEnter?: MouseEventHandler<HTMLDivElement>;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

const AnimatedItem: React.FC<AnimatedItemProps> = ({ children, delay = 0, index, onMouseEnter, onClick }) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4, once: true });
  const { effects } = useEffects();
  const animate = effectsAllowBackground(effects);
  return (
    <motion.div
      ref={ref}
      data-index={index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      initial={animate ? { y: 4, opacity: 0 } : false}
      animate={inView || !animate ? { y: 0, opacity: 1 } : { y: 4, opacity: 0 }}
      transition={{ duration: animate ? 0.18 : 0, delay: animate ? delay : 0 }}
      style={{ marginBottom: "0.5rem", cursor: onClick ? "pointer" : "default" }}
    >
      {children}
    </motion.div>
  );
};

interface AnimatedListProps {
  items?: (string | ReactNode)[];
  onItemSelect?: (item: string | ReactNode, index: number) => void;
  showGradients?: boolean;
  enableArrowNavigation?: boolean;
  className?: string;
  itemClassName?: string;
  displayScrollbar?: boolean;
  initialSelectedIndex?: number;
}

const AnimatedList: React.FC<AnimatedListProps> = ({
  items = [],
  onItemSelect,
  showGradients = true,
  enableArrowNavigation = false,
  className = "",
  itemClassName = "",
  displayScrollbar = true,
  initialSelectedIndex = -1,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex);
  const [topGradientOpacity, setTopGradientOpacity] = useState(0);
  const [bottomGradientOpacity, setBottomGradientOpacity] = useState(1);

  const handleScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const { scrollTop, scrollHeight, clientHeight } = target;
    setTopGradientOpacity(Math.min(scrollTop / 50, 1));
    const bottomDistance = scrollHeight - (scrollTop + clientHeight);
    setBottomGradientOpacity(scrollHeight <= clientHeight ? 0 : Math.min(bottomDistance / 50, 1));
  }, []);

  useEffect(() => {
    if (!enableArrowNavigation) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enableArrowNavigation, items.length]);

  return (
    <div className={`scroll-list-container ${className}`}>
      <div ref={listRef} className={`scroll-list ${displayScrollbar ? "" : "no-scrollbar"}`} onScroll={handleScroll}>
        {items.map((item, index) => (
          <AnimatedItem
            key={index}
            delay={Math.min(index * 0.03, 0.24)}
            index={index}
            onMouseEnter={onItemSelect ? () => setSelectedIndex(index) : undefined}
            onClick={onItemSelect ? () => onItemSelect(item, index) : undefined}
          >
            <div className={`item ${selectedIndex === index ? "selected" : ""} ${itemClassName}`}>
              {typeof item === "string" ? <p className="item-text">{item}</p> : item}
            </div>
          </AnimatedItem>
        ))}
      </div>
      {showGradients ? (
        <>
          <div className="top-gradient" style={{ opacity: topGradientOpacity }} />
          <div className="bottom-gradient" style={{ opacity: bottomGradientOpacity }} />
        </>
      ) : null}
    </div>
  );
};

export default AnimatedList;
