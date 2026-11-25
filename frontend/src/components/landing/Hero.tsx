"use client";

import Image from "next/image";
import { motion } from "motion/react";
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

/**
 * Full-viewport hero: just the local photograph as a static background, with a
 * light readability scrim behind the copy. No WebGL, no SVG scene, no zoom or
 * parallax — reduced-motion users and everyone else get the same plain image.
 */
export default function Hero({
  imageSrc,
  imageAlt,
}: {
  imageSrc: string;
  imageAlt: string;
}) {
  return (
    <section className="relative flex min-h-[92svh] items-center overflow-hidden bg-brand text-brand-foreground 3xl:min-h-[85svh] 4xl:min-h-[80svh]">
      <div className="absolute inset-0" aria-hidden>
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
        {/* Dark, localised scrim: strong behind the copy, near-transparent
            elsewhere so the tourist photo stays visible. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, color-mix(in oklab, var(--brand) 68%, transparent) 0%, color-mix(in oklab, var(--brand) 30%, transparent) 38%, transparent 70%), linear-gradient(to top, color-mix(in oklab, var(--brand) 48%, transparent) 0%, transparent 42%)",
          }}
        />
      </div>

      <div className="landing-shell relative pb-20 pt-28 sm:pb-24 sm:pt-32 3xl:py-40">
        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="hero-copy mb-3 inline-flex items-center gap-2 rounded-full border border-brand-foreground/30 bg-brand/30 px-3 py-1 text-[0.7rem] font-medium uppercase tracking-wider text-brand-foreground backdrop-blur-sm sm:text-xs 4xl:text-sm"
        >
          Booking · Payments · Dispatch · Safety
        </motion.p>
        <motion.h1
          variants={container}
          initial="hidden"
          animate="show"
          className="hero-copy max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl 3xl:max-w-5xl 3xl:text-6xl 4xl:max-w-6xl 4xl:text-8xl"
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
          className="hero-copy mt-5 max-w-xl text-base text-brand-foreground sm:text-lg 3xl:max-w-3xl 3xl:text-xl 4xl:text-2xl"
        >
          Quotes in under a minute, M-Pesa deposits reconciled automatically, drivers
          dispatched by SMS, and safety alerts that reach every guest on an active trip.
        </motion.p>
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:gap-4"
        >
          <Button asChild size="lg" className="hero-btn w-full bg-accent text-accent-foreground hover:bg-accent/90 sm:w-auto">
            <a href="/sign-up">Plan a safari</a>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="hero-btn w-full border-brand-foreground/40 bg-brand/25 text-brand-foreground hover:bg-brand/45 hover:text-brand-foreground sm:w-auto"
          >
            <a href="/sign-in">Sign in</a>
          </Button>
        </motion.div>
        <motion.a
          variants={fadeUp}
          initial="hidden"
          animate="show"
          href="#parks"
          className="hero-copy mt-16 hidden items-center gap-2 text-xs font-medium text-brand-foreground/90 transition-colors hover:text-brand-foreground sm:inline-flex 4xl:text-base"
        >
          Explore the parks <ChevronDown className="h-4 w-4" />
        </motion.a>
      </div>
    </section>
  );
}
