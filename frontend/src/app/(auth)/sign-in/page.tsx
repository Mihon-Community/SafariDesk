import { Suspense } from "react";

import Login from "@/views/Login";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Sign in — SafariDesk" };

export default function SignInPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-80 w-full max-w-sm" />}>
      <Login />
    </Suspense>
  );
}
