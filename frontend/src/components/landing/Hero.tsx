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
    <section className="relative flex min-h-[92svh] items-center overflow-hidden bg-brand text-brand-foreground">
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
        {/* static scrim only — keeps the copy readable without adding graphics */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, var(--background) 0%, color-mix(in oklab, var(--background) 55%, transparent) 45%, transparent 75%), linear-gradient(to right, color-mix(in oklab, var(--background) 70%, transparent) 0%, transparent 60%)",
          }}
        />
      </div>

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
          className="mt-16 hidden items-center gap-2 text-xs font-medium text-brand-foreground/80 transition-colors hover:text-brand-foreground sm:inline-flex"
        >
          Explore the parks <ChevronDown className="h-4 w-4" />
        </motion.a>
      </div>
    </section>
  );
}
