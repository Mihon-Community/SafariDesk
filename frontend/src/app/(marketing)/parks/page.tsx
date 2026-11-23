import { MarketingFooter, MarketingHeader, ParksSection } from "@/components/landing/sections";

export const metadata = { title: "Parks — SafariDesk" };

export default function ParksPage() {
  return (
    <main>
      <MarketingHeader />
      <ParksSection />
      <MarketingFooter />
    </main>
  );
}
