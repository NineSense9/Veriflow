"use client";

import { AnimatePresence, motion, type Variants } from "motion/react";
import React, { Children, type HTMLAttributes, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import "./Stepper.css";
import { useEffects } from "@/lib/effects";

interface StepperProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  initialStep?: number;
  currentStep?: number;
  statuses?: string[];
  labels?: string[];
  glowRunning?: boolean;
  onStepChange?: (step: number) => void;
  onFinalStepCompleted?: () => void;
  disableStepIndicators?: boolean;
  hideFooter?: boolean;
}

export function Step({ children }: { children: ReactNode }) {
  return <div className="step-default">{children}</div>;
}

export default function Stepper({
  children,
  initialStep = 1,
  currentStep: controlled,
  statuses,
  labels,
  glowRunning = false,
  onStepChange = () => {},
  onFinalStepCompleted = () => {},
  disableStepIndicators = false,
  hideFooter = false,
  className = "",
  ...rest
}: StepperProps) {
  const { effects } = useEffects();
  const animate = effects === "full" || effects === "balanced";
  const stepsArray = Children.toArray(children);
  const totalSteps = stepsArray.length;
  const [internal, setInternal] = useState(initialStep);
  const [direction, setDirection] = useState(0);
  const currentStep = controlled ?? internal;
  const isCompleted = currentStep > totalSteps;

  const updateStep = (newStep: number) => {
    setInternal(newStep);
    if (newStep > totalSteps) onFinalStepCompleted();
    else onStepChange(newStep);
  };

  return (
    <div className={`outer-container ${className}`} {...rest}>
      <div className="step-circle-container" style={{ border: "1px solid var(--border, #dfe3e8)" }}>
        <div className="step-indicator-row" role="group" aria-label="核验流水线">
          {stepsArray.map((_, index) => {
            const stepNumber = index + 1;
            const status = statuses?.[index];
            const running = animate && glowRunning && status === "RUNNING";
            const label = labels?.[index] || `Step ${stepNumber}`;
            return (
              <React.Fragment key={stepNumber}>
                <button
                  type="button"
                  className={`step-indicator ${currentStep === stepNumber ? "active" : ""} ${running ? "glow" : ""}`}
                  data-status={status || "NOT_RUN"}
                  aria-label={`${label} · ${status || "NOT_RUN"}`}
                  disabled={disableStepIndicators}
                  onClick={() => {
                    setDirection(stepNumber > currentStep ? 1 : -1);
                    updateStep(stepNumber);
                  }}
                  aria-current={currentStep === stepNumber ? "step" : undefined}
                >
                  <span className="step-status-dot" aria-hidden="true">{status === "PASS" ? "✓" : status === "FAIL" ? "!" : stepNumber}</span>
                  <span className="step-label">{label}</span>
                  <span className="step-status-text">{status || "NOT_RUN"}</span>
                </button>
                {index < totalSteps - 1 ? <div className="step-connector" aria-hidden="true" /> : null}
              </React.Fragment>
            );
          })}
        </div>
        <StepContentWrapper animate={animate} isCompleted={isCompleted} currentStep={currentStep} direction={direction}>
          {stepsArray[currentStep - 1]}
        </StepContentWrapper>
        {!hideFooter && !isCompleted ? (
          <div className="footer-container">
            <div className={`footer-nav ${currentStep !== 1 ? "spread" : "end"}`}>
              {currentStep !== 1 ? (
                <button
                  type="button"
                  className="back-button"
                  onClick={() => {
                    setDirection(-1);
                    updateStep(currentStep - 1);
                  }}
                >
                  Back
                </button>
              ) : null}
              <button
                type="button"
                className="next-button"
                onClick={() => {
                  setDirection(1);
                  updateStep(currentStep === totalSteps ? totalSteps + 1 : currentStep + 1);
                }}
              >
                {currentStep === totalSteps ? "Complete" : "Continue"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StepContentWrapper({
  animate,
  isCompleted,
  currentStep,
  direction,
  children,
}: {
  animate: boolean;
  isCompleted: boolean;
  currentStep: number;
  direction: number;
  children: ReactNode;
}) {
  const [parentHeight, setParentHeight] = useState(0);
  if (!animate) return <div className="step-content-default">{!isCompleted ? children : null}</div>;
  return (
    <motion.div className="step-content-default" style={{ position: "relative", overflow: "hidden" }} animate={{ height: isCompleted ? 0 : parentHeight }} transition={{ type: "spring", duration: 0.4 }}>
      <AnimatePresence initial={false} mode="sync" custom={direction}>
        {!isCompleted ? (
          <SlideTransition key={currentStep} direction={direction} onHeightReady={(h) => setParentHeight(h)}>
            {children}
          </SlideTransition>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function SlideTransition({
  children,
  direction,
  onHeightReady,
}: {
  children: ReactNode;
  direction: number;
  onHeightReady: (h: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (containerRef.current) onHeightReady(containerRef.current.offsetHeight);
  }, [children, onHeightReady]);
  const variants: Variants = {
    enter: (dir: number) => ({ x: dir >= 0 ? "-40%" : "40%", opacity: 0 }),
    center: { x: "0%", opacity: 1 },
    exit: (dir: number) => ({ x: dir >= 0 ? "30%" : "-30%", opacity: 0 }),
  };
  return (
    <motion.div
      ref={containerRef}
      custom={direction}
      variants={variants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.35 }}
      style={{ position: "absolute", left: 0, right: 0, top: 0 }}
    >
      {children}
    </motion.div>
  );
}
