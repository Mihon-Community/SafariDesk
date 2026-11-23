import {
  AttractionsSection,
  MarketingFooter,
  MarketingHeader,
} from "@/components/landing/sections";

export const metadata = { title: "Attractions — SafariDesk" };

export default function AttractionsPage() {
  return (
    <main>
      <MarketingHeader />
      <AttractionsSection />
      <MarketingFooter />
    </main>
  );
}
