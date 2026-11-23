import { Suspense } from "react";

import Bookings from "@/views/Bookings";
import { TableSkeleton } from "@/components/States";

export const metadata = { title: "Bookings — SafariDesk" };

// useSearchParams needs a Suspense boundary during prerendering.
export default function BookingsPage() {
  return (
    <Suspense fallback={<div className="space-y-4"><TableSkeleton rows={6} /></div>}>
      <Bookings />
    </Suspense>
  );
}
