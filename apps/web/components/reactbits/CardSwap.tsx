"use client";

import React, {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./CardSwap.css";

export interface CardSwapProps {
  width?: number | string;
  height?: number | string;
  cardDistance?: number;
  verticalDistance?: number;
  delay?: number;
  pauseOnHover?: boolean;
  onCardClick?: (idx: number) => void;
  skewAmount?: number;
  children: ReactNode;
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  customClass?: string;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(({ customClass, ...rest }, ref) => (
  <div ref={ref} {...rest} className={`card ${customClass ?? ""} ${rest.className ?? ""}`.trim()} />
));
Card.displayName = "Card";

function slot(i: number, distX: number, distY: number, total: number) {
  return {
    x: i * distX,
    y: -i * distY,
    z: -i * distX * 1.4,
    zIndex: total - i,
  };
}

const CardSwap: React.FC<CardSwapProps> = ({
  width = 420,
  height = 280,
  cardDistance = 48,
  verticalDistance = 56,
  delay = 4200,
  pauseOnHover = true,
  onCardClick,
  skewAmount = 5,
  children,
}) => {
  const childArr = useMemo(() => Children.toArray(children) as ReactElement<CardProps>[], [children]);
  const [order, setOrder] = useState(() => childArr.map((_, i) => i));
  const paused = useRef(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOrder(childArr.map((_, i) => i));
  }, [childArr.length]);

  useEffect(() => {
    if (childArr.length < 2) return;
    const id = window.setInterval(() => {
      if (paused.current) return;
      setOrder((prev) => (prev.length < 2 ? prev : [...prev.slice(1), prev[0]]));
    }, delay);
    return () => clearInterval(id);
  }, [childArr.length, delay]);

  return (
    <div
      ref={container}
      className="card-swap-container"
      style={{ width, height, position: "relative" }}
      onMouseEnter={() => {
        if (pauseOnHover) paused.current = true;
      }}
      onMouseLeave={() => {
        paused.current = false;
      }}
    >
      {childArr.map((child, i) => {
        const pos = order.indexOf(i);
        const s = slot(pos === -1 ? i : pos, cardDistance, verticalDistance, childArr.length);
        const node = isValidElement<CardProps>(child)
          ? cloneElement(child, {
              style: {
                width,
                height,
                transform: `translate(-50%, -50%) translate3d(${s.x}px, ${s.y}px, ${s.z}px) skewY(${skewAmount}deg)`,
                zIndex: s.zIndex,
                transition: "transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                ...(child.props.style ?? {}),
              },
              onClick: (e) => {
                child.props.onClick?.(e);
                onCardClick?.(i);
              },
            })
          : child;
        return <React.Fragment key={i}>{node}</React.Fragment>;
      })}
    </div>
  );
};

export default CardSwap;
