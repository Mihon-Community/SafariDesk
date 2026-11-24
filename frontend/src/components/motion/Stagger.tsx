"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" as const },
  },
};

/**
 * Staggered reveal used on first load for grids/cards (dashboard KPIs, chart
 * panels). Animation runs once on mount; reduced-motion users see everything
 * immediately, and only transform/opacity are animated.
 */
export function Stagger({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "ul" | "ol";
}) {
  const reduce = useReducedMotion();
  // motion.create does not exist in motion v14; map the tag explicitly.
  const Tag = as === "ul" ? motion.ul : as === "ol" ? motion.ol : motion.div;
  return (
    <Tag
      className={className}
      variants={container}
      initial={reduce ? "show" : "hidden"}
      animate="show"
    >
      {children}
    </Tag>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={reduce ? undefined : item}
      style={reduce ? undefined : { willChange: "transform, opacity" }}
    >
      {children}
    </motion.div>
  );
}
