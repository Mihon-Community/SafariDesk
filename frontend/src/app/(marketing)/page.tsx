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
 * Public landing page. The hero is just the local tourist safari photograph
 * as a static background with a readability scrim behind the copy.
 */
export default function LandingPage() {
  return (
    <main>
      <MarketingHeader />
      <Hero imageSrc={HERO_IMAGE} imageAlt="Tourists on game drive in Samburu National Reserve, Kenya" />
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
