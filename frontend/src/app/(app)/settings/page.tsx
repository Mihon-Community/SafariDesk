"use client";

import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeModeToggle, ThemePaletteGrid } from "@/components/ThemeMenu";
import { useThemeStore } from "@/store/theme";
import { THEMES } from "@/lib/themes";
import Link from "next/link";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const theme = useThemeStore((s) => s.theme);
  const active = THEMES.find((t) => t.id === theme) ?? THEMES[0];
  const { can } = usePermissions();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description="Appearance and workspace preferences."
      />

      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">Appearance</CardTitle>
          <CardDescription>
            Six palettes, each with light and dark variants plus a System mode that follows
            your device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-4 pt-2">
          <div className="flex flex-wrap items-center gap-3">
            <ThemeModeToggle size="default" />
            <p className="text-xs text-muted-foreground">
              Currently: <span className="font-medium text-foreground">{active.name}</span> · all
              palettes are checked for WCAG AA contrast in both modes.
            </p>
          </div>

          <ThemePaletteGrid columns={3} />

          <div className="grid gap-3 sm:grid-cols-3">
            <PreviewSwatch label="Primary" className="bg-primary text-primary-foreground" />
            <PreviewSwatch label="Accent" className="bg-accent text-accent-foreground" />
            <PreviewSwatch label="Brand surface" className="bg-brand text-brand-foreground" />
          </div>
        </CardContent>
      </Card>

      {can("settings:manage") && (
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">System control · super admin</CardTitle>
            <CardDescription>
              Full operational control: manage users and roles, review the audit trail, and change
              workspace settings. Restricted to super admins.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 p-4 pt-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/users">Manage users</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/audit">Review audit log</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PreviewSwatch({ label, className }: { label: string; className: string }) {
  return (
    <div className={`rounded-lg px-3 py-2.5 text-sm font-medium ${className}`}>
      {label}
    </div>
  );
}
