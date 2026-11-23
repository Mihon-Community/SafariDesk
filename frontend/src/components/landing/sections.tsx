import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Check,
  Clock3,
  MapPin,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "./Reveal";
import { Counter } from "./Counter";
import {
  ATTRACTIONS,
  FAQ,
  HERO_IMAGE,
  PARKS,
  PRICING,
  STATS,
  STEPS,
  TESTIMONIALS,
} from "@/lib/landing-data";

/* --------------------------------- header --------------------------------- */

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-foreground">
            S
          </span>
          <span className="text-base font-semibold">SafariDesk</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm md:flex">
          <a href="#parks" className="text-muted-foreground transition-colors hover:text-foreground">
            Parks
          </a>
          <a href="#attractions" className="text-muted-foreground transition-colors hover:text-foreground">
            Attractions
          </a>
          <a href="#how-it-works" className="text-muted-foreground transition-colors hover:text-foreground">
            How it works
          </a>
          <a href="#pricing" className="text-muted-foreground transition-colors hover:text-foreground">
            Pricing
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/sign-in">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

/* -------------------------------- trust bar ------------------------------- */

export function TrustBar() {
  return (
    <section className="border-b bg-card">
      <dl className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-4">
        {STATS.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.08}>
            <dt className="order-2 text-xs text-muted-foreground">{s.label}</dt>
            <dd className="text-3xl font-semibold tracking-tight">
              <Counter value={s.value} suffix={s.suffix} />
            </dd>
          </Reveal>
        ))}
      </dl>
    </section>
  );
}

/* ---------------------------------- parks --------------------------------- */

export function ParksSection() {
  return (
    <section id="parks" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Featured parks</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Kenya and Tanzania, covered
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Park fees are loaded per residency and season, so quotes are correct for citizens,
            residents and non-residents across every park we cover.
          </p>
        </Reveal>

        <div className="container-card mt-10">
          <div className="grid grid-cols-1 gap-5 @min-[600px]:grid-cols-2 @min-[960px]:grid-cols-3">
          {PARKS.map((park, i) => (
            <Reveal key={park.name} delay={(i % 3) * 0.08}>
              <Card className="group overflow-hidden">
                <div className="relative aspect-[4/3] w-full overflow-hidden">
                  <Image
                    src={park.image}
                    alt={`${park.name} landscape`}
                    fill
                    loading="lazy"
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">{park.name}</h3>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {park.region}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{park.description}</p>
                </CardContent>
              </Card>
            </Reveal>
          ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- attractions ------------------------------ */

export function AttractionsSection() {
  return (
    <section id="attractions" className="scroll-mt-20 bg-card/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">
            Things to see &amp; do
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Beyond the game drive
          </h2>
        </Reveal>

        <div className="container-card mt-10">
          <div className="grid grid-cols-1 gap-5 @min-[520px]:grid-cols-2 @min-[1024px]:grid-cols-4">
          {ATTRACTIONS.map((a, i) => (
            <Reveal key={a.name} delay={(i % 4) * 0.06}>
              <Card className="group relative min-h-[16rem] overflow-hidden">
                <Image
                  src={a.image}
                  alt={a.name}
                  fill
                  loading="lazy"
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                <CardContent className="absolute inset-x-0 bottom-0 p-4 text-white">
                  <h3 className="font-semibold">{a.name}</h3>
                  <p className="mt-0.5 text-xs text-white/75">{a.detail}</p>
                </CardContent>
              </Card>
            </Reveal>
          ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- how it works ----------------------------- */

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">How it works</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Book, pay, dispatch, explore
          </h2>
        </Reveal>

        <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.1}>
              <li className="relative rounded-xl border bg-card p-4 shadow-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {i + 1}
                </span>
                <h3 className="mt-3 font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* -------------------------------- AI teaser ------------------------------- */

export function AITeaser() {
  return (
    <section className="bg-brand py-16 text-brand-foreground sm:py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal>
          <p className="inline-flex items-center gap-2 rounded-full border border-brand-foreground/25 px-3 py-1 text-xs font-medium uppercase tracking-wider text-brand-foreground/85">
            <Sparkles className="h-3.5 w-3.5" /> AI layer
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            An itinerary and concierge that never quote prices
          </h2>
          <p className="mt-3 max-w-xl text-sm text-brand-foreground/80 sm:text-base">
            The AI drafts itineraries from your packages and parks, answers guest questions in
            English or Swahili under 160 characters, and helps you write safety alerts. Money
            always comes from the rate engine — never from the model.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-brand-foreground/85">
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Draft-only: a human approves every alert
            </li>
            <li className="flex items-start gap-2">
              <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0" /> Keyword FAQ first, LLM second, no key required
            </li>
            <li className="flex items-start gap-2">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0" /> Guest replies by SMS are parsed into bookings
            </li>
          </ul>
        </Reveal>

        <Reveal delay={0.15}>
          <Card className="text-foreground">
            <CardContent className="space-y-3 p-5 text-sm">
              <p className="font-semibold">Day-by-day itinerary — Maasai Mara, 3 days</p>
              {[
                ["Day 1", "Arrive Sekenani gate, afternoon game drive, sundowner at Oloololo"],
                ["Day 2", "Full-day drive to the Mara River, migration crossings (seasonal)"],
                ["Day 3", "Morning drive to a Maasai village, depart after lunch"],
              ].map(([day, text]) => (
                <div key={day} className="flex gap-3 border-b pb-2 last:border-0 last:pb-0">
                  <span className="w-12 shrink-0 font-medium text-primary">{day}</span>
                  <span className="text-muted-foreground">{text}</span>
                </div>
              ))}
              <p className="pt-1 text-xs text-muted-foreground">
                Generated from your package and park data; editable before it is sent.
              </p>
            </CardContent>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------- testimonials ----------------------------- */

export function Testimonials() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Operators</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Built with teams who run trips daily
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.08}>
              <figure className="rounded-xl border bg-card p-5 shadow-sm">
                <blockquote className="text-sm leading-relaxed">“{t.quote}”</blockquote>
                <figcaption className="mt-4">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- pricing -------------------------------- */

export function PricingSection() {
  return (
    <section id="pricing" className="scroll-mt-20 bg-card/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Pricing</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Cheaper than one lost booking
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            One Docker deployment, one subscription. Voice, AI and analytics are included from Pro.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {PRICING.map((tier, i) => (
            <Reveal key={tier.name} delay={i * 0.1}>
              <Card className={`p-6 ${tier.highlight ? "border-primary ring-1 ring-primary" : ""}`}>
                <CardContent className="space-y-4 p-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{tier.name}</h3>
                    {tier.highlight && (
                      <span className="chip-success rounded-full px-2.5 py-0.5 text-xs font-medium">
                        Most popular
                      </span>
                    )}
                  </div>
                  <p className="text-3xl font-semibold tracking-tight">
                    {tier.price}
                    <span className="text-sm font-normal text-muted-foreground">{tier.period}</span>
                  </p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/sign-up" className="block">
                    <Button
                      variant={tier.highlight ? "default" : "outline"}
                      className="w-full"
                    >
                      {tier.cta}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------- FAQ ---------------------------------- */

export function FaqSection() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">FAQ</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Questions operators ask
          </h2>
        </Reveal>
        <div className="mt-8 space-y-3">
          {FAQ.map((item, i) => (
            <Reveal key={item.q} delay={i * 0.05}>
              <details className="group rounded-lg border bg-card px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium marker:hidden">
                  {item.q}
                  <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- CTA band ------------------------------- */

export function CtaBand() {
  return (
    <section className="bg-brand py-14 text-brand-foreground">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 sm:px-6 md:flex-row md:items-center md:justify-between">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Put your fleet on one record today.
          </h2>
          <p className="mt-2 text-sm text-brand-foreground/80 sm:text-base">
            Deploy in one click from the Africa&apos;s Talking Marketplace.
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <Link href="/sign-up">
            <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
              Create a free account
            </Button>
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------- footer --------------------------------- */

export function MarketingFooter() {
  return (
    <footer className="border-t bg-card">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-3">
        <div>
          <p className="font-semibold">SafariDesk</p>
          <p className="mt-2 text-xs text-muted-foreground">
            One booking record for quoting, payments, dispatch, safety and loyalty.
            Photographs on this page are licensed under the terms listed in
            public/images/CREDITS.md.
          </p>
        </div>
        <div className="space-y-2">
          <p className="font-medium">Product</p>
          <ul className="space-y-1.5 text-muted-foreground">
            <li><a href="#parks" className="hover:text-foreground">Parks</a></li>
            <li><a href="#attractions" className="hover:text-foreground">Attractions</a></li>
            <li><a href="#pricing" className="hover:text-foreground">Pricing</a></li>
            <li><Link href="/sign-in" className="hover:text-foreground">Operator sign in</Link></li>
          </ul>
        </div>
        <div className="space-y-2">
          <p className="font-medium">Company</p>
          <ul className="space-y-1.5 text-muted-foreground">
            <li><Link href="/about" className="hover:text-foreground">About</Link></li>
            <li><Link href="/contact" className="hover:text-foreground">Contact</Link></li>
            <li>Nairobi, Kenya</li>
          </ul>
        </div>
      </div>
      <div className="border-t px-4 py-4 text-center text-xs text-muted-foreground sm:px-6">
        © {new Date().getFullYear()} SafariDesk · Built for the Africa&apos;s Talking Marketplace
      </div>
    </footer>
  );
}

export { HERO_IMAGE };
