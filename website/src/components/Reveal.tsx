"use client";

import { motion } from "motion/react";

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  /** Distance in pixels to travel up into place. */
  distance?: number;
}

/**
 * Scroll-triggered reveal used across every section.
 *
 * Uses transform and opacity only, so it composites on the GPU and never
 * triggers layout. `once` means content does not re-animate on the way back up.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  distance = 26,
}: RevealProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{
        duration: 0.75,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </motion.div>
  );
}