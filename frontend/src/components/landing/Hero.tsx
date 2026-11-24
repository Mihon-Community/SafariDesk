"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";

const HeroScene = dynamic(() => import("./HeroScene"), {
  ssr: false,
  loading: () => null,
});

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

/**
 * Full-viewport hero. Renders the React Three Fiber savannah when the browser
 * can and the user has not asked for reduced motion; otherwise falls back to a
 * static photograph.
 */
export default function Hero({
  imageSrc,
  imageAlt,
}: {
  imageSrc: string;
  imageAlt: string;
}) {
  const [use3D, setUse3D] = useState(false);
  const [paused, setPaused] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setUse3D(!reduce && supportsWebGL());
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setPaused(!entry.isIntersecting),
      { threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative flex min-h-[92svh] items-center overflow-hidden bg-brand text-brand-foreground"
    >
      {/* Static fallback / pre-3D backdrop */}
      <div className="absolute inset-0" aria-hidden>
        <Image
          src={imageSrc}
          alt={imageAlt}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand via-brand/75 to-brand/45" />
        {/* readability scrim behind the copy block */}
        <div className="absolute inset-0 bg-gradient-to-r from-brand/85 via-brand/35 to-transparent" />
        {/* extra legibility on phones, where the 3D scene sits directly under the copy */}
        <div className="absolute inset-0 bg-black/25 sm:hidden" />
      </div>

      {use3D && (
        <div className="absolute inset-0">
          <HeroScene paused={paused} />
        </div>
      )}

      <div className="relative mx-auto w-full max-w-6xl px-4 pb-24 pt-32 sm:px-6">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-foreground/25 px-3 py-1 text-xs font-medium uppercase tracking-wider text-brand-foreground/85">
          Booking · Payments · Dispatch · Safety
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] sm:text-6xl [text-shadow:0_1px_12px_rgba(0,0,0,0.45)]">
          Every safari, run from one desk.
        </h1>
        <p className="mt-5 max-w-xl text-base text-brand-foreground/90 sm:text-lg [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]">
          Quotes in under a minute, M-Pesa deposits reconciled automatically, drivers
          dispatched by SMS, and safety alerts that reach every guest on an active trip.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
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
        </div>
        <a
          href="#parks"
          className="mt-16 hidden items-center gap-2 text-xs font-medium text-brand-foreground/70 transition-colors hover:text-brand-foreground sm:inline-flex"
        >
          Explore the parks <ChevronDown className="h-4 w-4 animate-bounce" />
        </a>
      </div>
    </section>
  );
}
