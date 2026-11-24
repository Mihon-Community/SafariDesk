"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";

/** 8×8 blurred stand-in so the hero photo never pops in unstyled. */
const BLUR_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23c98a3d'/%3E%3Cstop offset='0.6' stop-color='%237a5a2e'/%3E%3Cstop offset='1' stop-color='%23241a10'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='8' height='8' fill='url(%23g)'/%3E%3C/svg%3E";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
};

const word = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
};

/** Layered savannah silhouettes + sun/moon disc + gliding birds (SVG only). */
function SavannahGraphics() {
  return (
    <>
      {/* sun / moon disc with soft glow */}
      <div
        aria-hidden
        className="absolute right-[12%] top-[16%] size-28 rounded-full sm:size-40"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, var(--hero-from) 0%, color-mix(in oklab, var(--hero-from) 70%, white) 45%, transparent 72%)",
          filter: "blur(2px)",
          opacity: 0.9,
        }}
      />
      {/* birds */}
      <svg
        aria-hidden
        viewBox="0 0 200 60"
        className="bird-glide absolute left-0 top-[22%] h-10 w-40 text-brand-foreground/70"
      >
        <path d="M4 30 q8 -10 16 0 q8 -10 16 0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M60 44 q6 -8 12 0 q6 -8 12 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <svg
        aria-hidden
        viewBox="0 0 200 60"
        className="bird-glide bird-glide-slow absolute left-0 top-[30%] h-8 w-32 text-brand-foreground/50"
      >
        <path d="M4 30 q8 -10 16 0 q8 -10 16 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>

      {/* hills + acacia silhouettes follow the theme via currentColor */}
      <svg
        aria-hidden
        viewBox="0 0 1440 320"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-[38vh] w-full text-brand"
      >
        <path
          d="M0 224 L180 160 L360 208 L560 128 L760 192 L980 96 L1200 176 L1440 128 L1440 320 L0 320 Z"
          fill="currentColor"
          opacity="0.55"
        />
        <path
          d="M0 264 L220 200 L430 252 L640 180 L860 240 L1090 168 L1300 228 L1440 192 L1440 320 L0 320 Z"
          fill="currentColor"
          opacity="0.8"
        />
        <path
          d="M0 300 L260 268 L520 296 L780 252 L1040 292 L1260 262 L1440 288 L1440 320 L0 320 Z"
          fill="currentColor"
        />
        {/* acacia silhouette */}
        <g transform="translate(1120 118)" fill="currentColor">
          <path d="M0 60 C 4 40, 2 28, -6 14 L 6 14 C 2 28, 8 40, 6 60 Z" />
          <path d="M-64 16 C -30 2, 30 2, 64 16 C 30 10, -30 10, -64 16 Z" />
          <path d="M-40 8 C -18 -2, 18 -2, 40 8 C 18 4, -18 4, -40 8 Z" />
        </g>
        <g transform="translate(300 150) scale(0.8)" fill="currentColor">
          <path d="M0 60 C 4 40, 2 28, -6 14 L 6 14 C 2 28, 8 40, 6 60 Z" />
          <path d="M-64 16 C -30 2, 30 2, 64 16 C 30 10, -30 10, -64 16 Z" />
        </g>
      </svg>
    </>
  );
}

/**
 * Full-viewport hero: the savannah photograph with a slow Ken Burns zoom,
 * an SVG savannah silhouette layer that parallaxes on scroll, and staggered
 * copy. No WebGL, no three.js — reduced-motion users get a static image.
 */
export default function Hero({
  imageSrc,
  imageAlt,
}: {
  imageSrc: string;
  imageAlt: string;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  // Parallax: the SVG band drifts up gently as you scroll away.
  const hillsY = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : 24, reduce ? 0 : -24]);

  return (
    <section
      ref={sectionRef}
      className="relative flex min-h-[92svh] items-center overflow-hidden bg-brand text-brand-foreground"
    >
      <div className="absolute inset-0" aria-hidden>
        <div className={reduce ? "" : "kenburns absolute inset-0"}>
          <Image
            src={imageSrc}
            alt=""
            fill
            priority
            sizes="100vw"
            placeholder="blur"
            blurDataURL={BLUR_PLACEHOLDER}
            className="object-cover"
          />
        </div>
        {/* theme-tinted readability gradient (--background → transparent) */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, var(--background) 0%, color-mix(in oklab, var(--background) 55%, transparent) 45%, transparent 75%), linear-gradient(to right, color-mix(in oklab, var(--background) 70%, transparent) 0%, transparent 60%)",
          }}
        />
      </div>

      {!reduce && (
        <motion.div className="absolute inset-0" style={{ y: hillsY }} aria-hidden>
          <SavannahGraphics />
        </motion.div>
      )}
      {reduce && <SavannahGraphics />}

      <div className="relative mx-auto w-full max-w-6xl px-4 pb-24 pt-32 sm:px-6">
        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-foreground/25 px-3 py-1 text-xs font-medium uppercase tracking-wider text-brand-foreground/90"
        >
          Booking · Payments · Dispatch · Safety
        </motion.p>
        <motion.h1
          variants={container}
          initial="hidden"
          animate="show"
          className="max-w-3xl text-4xl font-semibold leading-[1.05] sm:text-6xl"
        >
          {"Every safari, run from one desk.".split(" ").map((w, i) => (
            <span key={i} className="inline-block overflow-hidden pb-1 align-bottom">
              <motion.span variants={word} className="inline-block">
                {w}
                {i < "Every safari, run from one desk.".split(" ").length - 1 ? "\u00A0" : ""}
              </motion.span>
            </span>
          ))}
        </motion.h1>
        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mt-5 max-w-xl text-base text-brand-foreground sm:text-lg"
        >
          Quotes in under a minute, M-Pesa deposits reconciled automatically, drivers
          dispatched by SMS, and safety alerts that reach every guest on an active trip.
        </motion.p>
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mt-8 flex flex-wrap gap-3"
        >
          <Button asChild size="lg" className="bg-accent text-accent-foreground shadow-lg hover:bg-accent/90">
            <a href="/sign-up">Plan a safari</a>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-brand-foreground/30 bg-transparent text-brand-foreground hover:bg-brand-foreground/10 hover:text-brand-foreground"
          >
            <a href="/sign-in">Sign in</a>
          </Button>
        </motion.div>
        <motion.a
          variants={fadeUp}
          initial="hidden"
          animate="show"
          href="#parks"
          className={`mt-16 hidden items-center gap-2 text-xs font-medium text-brand-foreground/80 transition-colors hover:text-brand-foreground sm:inline-flex ${reduce ? "" : "animate-bounce"}`}
        >
          Explore the parks <ChevronDown className="h-4 w-4" />
        </motion.a>
      </div>
    </section>
  );
}
