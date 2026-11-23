"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";

/** Theme/system settings land here in Phase 2; this stub keeps the route alive. */
export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" description="Appearance, workspace and preferences." />
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">Coming in Phase 2</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 text-sm text-muted-foreground">
          Theme palettes (6 colour themes x light/dark + System), workspace details
          and notification preferences will live here.
        </CardContent>
      </Card>
    </div>
  );
}
