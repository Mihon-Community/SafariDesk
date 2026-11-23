import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";

/** Marketing sub-pages are built out in Phase 3; these keep the routes alive. */
export default function MarketingStub({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="text-sm font-semibold">
            SafariDesk
          </Link>
          <Link href="/sign-in">
            <Button size="sm">Sign in</Button>
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <PageHeader title={title} description={description} />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            This page is a placeholder until Phase 3 lands the full marketing site with
            photography, interactive galleries and AI-assisted planning.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
