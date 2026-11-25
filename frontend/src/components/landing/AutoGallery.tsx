"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { HERO_IMAGE, PARKS } from "@/lib/landing-data";

const SLIDES = [
  {
    src: HERO_IMAGE,
    title: "Out on a real game drive",
    caption: "Tourists, vehicles and the savannah — the experience behind every booking.",
  },
  ...PARKS.slice(0, 4).map((park) => ({
    src: park.image,
    title: park.name,
    caption: park.description,
  })),
];

/** Auto-advancing image gallery. Pauses on hover/focus and under reduced motion. */
export function AutoGallery() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (paused || reduce) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % SLIDES.length),
      5_000,
    );
    return () => window.clearInterval(timer);
  }, [paused, reduce]);

  function move(step: number) {
    setIndex((current) => (current + step + SLIDES.length) % SLIDES.length);
  }

  return (
    <section className="landing-shell py-16 sm:py-24 3xl:py-28 4xl:py-32">
      <div className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-wider text-primary">Field notes</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl 3xl:text-5xl 4xl:text-6xl">
          See the places behind the paperwork
        </h2>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          The slides change on their own — pause with a pointer or keyboard focus.
        </p>
      </div>

      <div
        className="relative mt-8 aspect-[16/10] w-full overflow-hidden rounded-2xl border bg-muted sm:aspect-[16/8] 3xl:aspect-[21/8]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        aria-roledescription="carousel"
        aria-label="Safari destinations"
      >
        {SLIDES.map((slide, i) => (
          <div
            key={slide.src}
            className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${
              i === index ? "opacity-100" : "opacity-0"
            }`}
            aria-hidden={i !== index}
          >
            <Image
              src={slide.src}
              alt={i === index ? slide.title : ""}
              fill
              priority={i === 0}
              loading={i === 0 ? undefined : "lazy"}
              sizes="(min-width: 1920px) 1680px, (min-width: 1280px) 1152px, 100vw"
              className="object-cover"
            />
          </div>
        ))}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 text-white sm:p-6 3xl:p-10">
          <p className="text-xs font-medium uppercase tracking-widest text-white/75">
            {index + 1} / {SLIDES.length}
          </p>
          <h3 className="mt-1 text-xl font-semibold sm:text-2xl 3xl:text-4xl">
            {SLIDES[index]!.title}
          </h3>
          <p className="mt-1 max-w-xl text-sm text-white/85 3xl:text-lg">
            {SLIDES[index]!.caption}
          </p>
        </div>

        <button
          type="button"
          onClick={() => move(-1)}
          aria-label="Previous image"
          className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/70 sm:h-11 sm:w-11"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => move(1)}
          aria-label="Next image"
          className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/70 sm:h-11 sm:w-11"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <div className="absolute bottom-4 right-4 flex gap-1.5">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show image ${i + 1}`}
              aria-current={i === index}
              className={`h-2 rounded-full transition-all ${
                i === index ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
