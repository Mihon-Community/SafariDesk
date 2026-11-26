"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HERO_CREDIT, STATS } from "@/lib/landing-data";

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

const HEADLINE = "Every safari, run from one desk.";

/**
 * First screen: who SafariDesk helps, what it does, and where to go next.
 * Static local photograph, themed readability scrim, restrained reveal motion.
 */
export default function Hero({
  imageSrc,
  imageAlt,
}: {
  imageSrc: string;
  imageAlt: string;
}) {
  const reduce = Boolean(useReducedMotion());
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const distantHillY = useTransform(scrollYProgress, [0, 1], [0, 16]);
  const nearHillY = useTransform(scrollYProgress, [0, 1], [0, 32]);

  // With reduced motion the same markup renders without variants or transforms.
  const fade = reduce ? {} : { variants: fadeUp, initial: "hidden", animate: "show" };
  const stagger = reduce ? {} : { variants: container, initial: "hidden", animate: "show" };

  return (
    <section
      ref={sectionRef}
      className="relative flex min-h-[92svh] items-center overflow-hidden bg-brand text-brand-foreground 3xl:min-h-[85svh] 4xl:min-h-[80svh]"
    >
      <div className="absolute inset-0">
        <Image
          src={imageSrc}
          alt={imageAlt}
          fill
          priority
          sizes="100vw"
          placeholder="blur"
          blurDataURL={BLUR_PLACEHOLDER}
          className={`object-cover ${reduce ? "" : "hero-ken-burns"}`}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, color-mix(in oklab, var(--brand) 82%, transparent) 0%, color-mix(in oklab, var(--brand) 56%, transparent) 38%, color-mix(in oklab, var(--brand) 12%, transparent) 76%), linear-gradient(to top, color-mix(in oklab, var(--brand) 78%, transparent) 0%, color-mix(in oklab, var(--brand) 34%, transparent) 28%, transparent 68%)",
          }}
        />
      </div>

      <div
        aria-hidden="true"
        className="hero-sun pointer-events-none absolute right-[14%] top-[14%] size-20 rounded-full sm:right-[20%] sm:top-[16%] sm:size-32"
      />

      <svg
        aria-hidden="true"
        viewBox="0 0 1440 260"
        preserveAspectRatio="xMidYMax slice"
        className="hero-birds pointer-events-none absolute inset-x-0 top-[16%] h-[34%] w-full overflow-visible text-brand-foreground"
      >
        <g transform="translate(210 80)">
          <g className="hero-bird-flight">
            <path d="M0 10q8-10 16 0 8-10 16 0" />
          </g>
        </g>
        <g transform="translate(390 40)">
          <g className="hero-bird-flight hero-bird-flight-late">
            <path d="M0 10q6-7 12 0 6-7 12 0" />
          </g>
        </g>
        <g transform="translate(500 110)">
          <g className="hero-bird-flight hero-bird-flight-later">
            <path d="M0 10q5-6 10 0 5-6 10 0" />
          </g>
        </g>
      </svg>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] min-h-36 max-h-80 overflow-hidden text-brand"
      >
        <svg viewBox="0 0 1440 300" preserveAspectRatio="xMidYMax slice" className="h-full w-full">
          <motion.g style={{ y: reduce ? 0 : distantHillY }}>
            <path
              d="M0 202c118-45 202-17 312-52 112-35 191-5 300 18 98 21 155-43 284-26 128 16 197 51 310 23 91-23 160-4 234 28v107H0z"
              fill="currentColor"
              opacity=".38"
            />
            <path
              d="M0 232c116-31 209-19 331-2 119 17 194-35 304-25 129 12 184 40 315 24 115-14 186-48 303-16 82 22 130 23 187 9v78H0z"
              fill="currentColor"
              opacity=".66"
            />
          </motion.g>
          <motion.g style={{ y: reduce ? 0 : nearHillY }} fill="currentColor">
            <path d="M0 263c124-26 205-17 319-8 128 10 214-22 352-12 116 8 186 30 314 18 133-13 210-22 304-3 72 14 112 13 151 4v38H0z" />
            <g transform="translate(130 111) scale(1.05)">
              <path d="M52 161c8-41 8-77 2-113l12-2c-2 43 2 80 12 115z" />
              <path d="M4 48c18 3 35 1 51-6 17-11 38-11 61-2 17-7 35-5 52 5-14 5-28 6-43 3-19 8-39 8-60 2-18 7-39 7-61-2z" />
            </g>
            <g transform="translate(1180 154) scale(.72)">
              <path d="M52 161c8-41 8-77 2-113l12-2c-2 43 2 80 12 115z" />
              <path d="M4 48c18 3 35 1 51-6 17-11 38-11 61-2 17-7 35-5 52 5-14 5-28 6-43 3-19 8-39 8-60 2-18 7-39 7-61-2z" />
            </g>
          </motion.g>
        </svg>
      </div>

      <div className="landing-shell relative z-10 pb-24 pt-28 sm:pb-28 sm:pt-32 3xl:py-40">
        <motion.p
          {...fade}
          className="hero-copy mb-4 inline-flex items-center gap-2 rounded-full border border-brand-foreground/30 bg-brand/35 px-3 py-1.5 text-[0.7rem] font-medium uppercase tracking-wider text-brand-foreground backdrop-blur-sm sm:text-xs 4xl:text-sm"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          For safari operators, drivers &amp; guests
        </motion.p>

        <motion.h1
          {...stagger}
          className="hero-copy landing-display max-w-3xl text-4xl leading-[1.06] sm:text-5xl sm:leading-[1.04] 3xl:max-w-5xl 3xl:text-6xl 4xl:max-w-6xl 4xl:text-8xl"
        >
          {reduce ? (
            HEADLINE
          ) : (
            HEADLINE.split(" ").map((w, i) => (
              <span key={i} className="inline-block overflow-hidden pb-1 align-bottom">
                <motion.span variants={word} className="inline-block">
                  {w}
                  {i < HEADLINE.split(" ").length - 1 ? "\u00A0" : ""}
                </motion.span>
              </span>
            ))
          )}
        </motion.h1>

        <motion.p
          {...fade}
          className="hero-copy mt-5 max-w-xl text-base leading-relaxed text-brand-foreground sm:text-lg 3xl:max-w-3xl 3xl:text-xl 4xl:text-2xl"
        >
          SafariDesk turns each quote into one shared trip record — M-Pesa deposits, driver
          dispatch and guest safety alerts included.
        </motion.p>

        <motion.div
          {...fade}
          className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:gap-4"
        >
          <Button
            asChild
            size="lg"
            className="hero-btn w-full bg-accent text-accent-foreground hover:bg-accent/90 sm:w-auto"
          >
            <Link href="/sign-up">Plan a safari</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="hero-btn w-full border-brand-foreground/40 bg-brand/25 text-brand-foreground hover:bg-brand/45 hover:text-brand-foreground sm:w-auto"
          >
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </motion.div>

        <motion.p
          {...fade}
          className="hero-copy mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand-foreground/85 3xl:text-sm"
        >
          <span className="font-semibold">{STATS[0]!.value.toLocaleString("en-KE")}{STATS[0]!.suffix} trips run</span>
          <span aria-hidden>·</span>
          <span>{STATS[2]!.value} parks covered</span>
          <span aria-hidden>·</span>
          <span>Kenya &amp; Tanzania</span>
        </motion.p>

        <motion.a
          {...fade}
          href="#why-us"
          className="hero-copy mt-12 hidden items-center gap-2 text-xs font-medium text-brand-foreground/90 transition-colors hover:text-brand-foreground sm:inline-flex 4xl:text-base"
        >
          See why teams switch <ChevronDown className="h-4 w-4" aria-hidden />
        </motion.a>
      </div>

      <p className="hero-copy absolute bottom-3 right-4 z-10 hidden text-[10px] text-brand-foreground/80 sm:block">
        Photo: {HERO_CREDIT}
      </p>
    </section>
  );
}
