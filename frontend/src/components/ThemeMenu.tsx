"use client";

import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/cn";
import { useThemeStore } from "@/store/theme";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Light / dark / system mode switch shared by the top bar and Settings. */
export function ThemeModeToggle({ size = "sm" }: { size?: "sm" | "default" }) {
  const { theme, setTheme } = useTheme();

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size={size}
      value={theme ?? "system"}
      onValueChange={(value) => {
        if (value) setTheme(value as "light" | "dark" | "system");
      }}
      aria-label="Colour mode"
    >
      <ToggleGroupItem value="light" aria-label="Light mode">
        <Sun className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Light</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" aria-label="Dark mode">
        <Moon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Dark</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="system" aria-label="System mode">
        <Monitor className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">System</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

/** Palette grid with live swatches; used in the top bar menu and Settings. */
export function ThemePaletteGrid({ columns = 3 }: { columns?: number }) {
  const active = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {THEMES.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            title={t.description}
            aria-pressed={selected}
            className={cn(
              "group flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-all",
              "hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected && "border-primary ring-1 ring-primary",
            )}
          >
            <span className="flex h-6 overflow-hidden rounded-md">
              {t.swatches.map((c) => (
                <span key={c} className="h-full flex-1" style={{ backgroundColor: c }} />
              ))}
            </span>
            <span className="flex items-center justify-between gap-1 text-xs font-medium">
              <span className="truncate">{t.name}</span>
              {selected && <Check className="h-3.5 w-3.5 text-primary" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Compact trigger that opens the mode + palette controls (top bar). */
export function ThemeMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-card text-sm shadow-xs transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Appearance settings"
        >
          <Palette className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[20rem]">
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Mode</p>
        <div className="px-1 pb-2">
          <ThemeModeToggle />
        </div>
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Palette</p>
        <div className="px-1 pb-1">
          <ThemePaletteGrid columns={2} />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
