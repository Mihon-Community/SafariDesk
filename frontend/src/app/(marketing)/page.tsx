import Hero from "@/components/landing/Hero";
import {
  AITeaser,
  AttractionsSection,
  CtaBand,
  FaqSection,
  HowItWorks,
  MarketingFooter,
  MarketingHeader,
  ParksSection,
  PricingSection,
  Testimonials,
  TrustBar,
} from "@/components/landing/sections";
import { HERO_IMAGE } from "@/lib/landing-data";

export const metadata = {
  title: "SafariDesk — Safari & Tour Operations for Kenya",
  description:
    "Quoting, M-Pesa deposits, driver dispatch and safety alerts for Kenyan tour operators. Guests book over USSD, SMS and Voice; you run it all from one dashboard.",
};

/**
 * Public landing page (Phase 3). The hero renders a React Three Fiber savannah
 * where WebGL is available and the user has not asked for reduced motion;
 * otherwise it shows the static hero photograph.
 */
export default function LandingPage() {
  return (
    <main>
      <MarketingHeader />
      <Hero imageSrc={HERO_IMAGE} imageAlt="Golden-hour savannah with acacia trees" />
      <TrustBar />
      <ParksSection />
      <AttractionsSection />
      <HowItWorks />
      <AITeaser />
      <Testimonials />
      <PricingSection />
      <FaqSection />
      <CtaBand />
      <MarketingFooter />
    </main>
  );
}
