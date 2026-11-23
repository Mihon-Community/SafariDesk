import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata = {
  title: "SafariDesk — Safari & Tour Operations",
  description:
    "Quoting, M-Pesa deposits, driver dispatch and safety alerts for Kenyan tour operators.",
};

/**
 * Landing page placeholder for Phase 1; Phase 3 replaces this with the 3D hero,
 * featured parks, attractions, how-it-works, testimonials, pricing and FAQ.
 */
export default function LandingPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-[#143c2c] text-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 font-bold text-[#143c2c]">
            S
          </div>
          <span className="text-lg font-semibold">SafariDesk</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link href="/sign-in">
            <Button variant="ghost" className="text-white/80 hover:bg-white/10 hover:text-white">
              Sign in
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button className="bg-amber-500 text-[#143c2c] hover:bg-amber-400">Get started</Button>
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <div className="space-y-5">
          <h1 className="text-3xl font-semibold leading-tight sm:text-5xl">
            Run your safari business from one dashboard.
          </h1>
          <p className="max-w-xl text-sm text-white/70 sm:text-base">
            Quotes in under a minute, M-Pesa deposits reconciled automatically, drivers
            dispatched by SMS and safety alerts that reach every guest on an active trip.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/sign-up">
              <Button className="bg-amber-500 text-[#143c2c] hover:bg-amber-400">
                Plan a safari
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button
                variant="outline"
                className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                Operator sign in
              </Button>
            </Link>
          </div>
          <p className="text-xs text-white/50">
            Phase 3 adds the interactive 3D hero, park gallery and AI itinerary teaser.
          </p>
        </div>
        <div className="hidden rounded-2xl border border-white/10 bg-white/5 p-6 lg:block">
          <p className="text-sm font-medium text-white/80">Eight modules, one booking record</p>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            <li>Booking &amp; quoting — web, USSD and SMS</li>
            <li>Payments — M-Pesa STK push, receipts, reconciliation</li>
            <li>Dispatch — drivers, vehicles, conflict checks</li>
            <li>Guest experience — itinerary, concierge, IVR, feedback</li>
            <li>Safety alerts, loyalty, analytics and an AI layer</li>
          </ul>
        </div>
      </section>

      <footer className="border-t border-white/10 px-4 py-6 text-center text-xs text-white/50 sm:px-6">
        SafariDesk · Nairobi · Built for Africa&apos;s Talking Marketplace
      </footer>
    </main>
  );
}
