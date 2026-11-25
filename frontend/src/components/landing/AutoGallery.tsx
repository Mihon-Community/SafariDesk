"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

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
  const [playing, setPlaying] = useState(true);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (paused || !playing || reduce) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % SLIDES.length),
      5_000,
    );
    return () => window.clearInterval(timer);
  }, [paused, playing, reduce]);

  function move(step: number) {
    setPlaying(false);
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
          Explore the parks and destinations that shape every safari itinerary.
        </p>
      </div>

      <div
        className="relative mt-8 aspect-[16/10] w-full overflow-hidden rounded-2xl border bg-muted sm:aspect-[16/8] 3xl:aspect-[21/8]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        role="region"
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
        <div className="absolute inset-x-0 bottom-0 p-4 pb-16 text-white sm:p-6 sm:pb-6 3xl:p-10">
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
          className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => move(1)}
          aria-label="Next image"
          className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
        <div className="absolute bottom-2 right-2 flex items-center gap-0.5 sm:bottom-3 sm:right-3">
          <button
            type="button"
            onClick={() => setPlaying((current) => !current)}
            aria-label={playing ? "Pause slide rotation" : "Resume slide rotation"}
            className="grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75"
          >
            {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          </button>
          {SLIDES.map((slide, i) => (
            <button
              key={slide.src}
              type="button"
              onClick={() => {
                setPlaying(false);
                setIndex(i);
              }}
              aria-label={`Show image ${i + 1}`}
              aria-current={i === index}
              className="grid h-11 w-11 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span
                aria-hidden
                className={`h-2 rounded-full transition-[width,background-color] ${
                  i === index ? "w-5 bg-white" : "w-2 bg-white/55"
                }`}
              />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
