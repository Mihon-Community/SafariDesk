/**
 * Colour-theme registry (Phase 2).
 *
 * `next-themes` owns the light/dark mode; this list owns the colour palette,
 * applied as [data-theme="<id>"] on <html>. Values must match globals.css.
 */
export const THEMES = [
  {
    id: "savannah",
    name: "Savannah",
    description: "Golden grass and warm amber",
    swatches: ["#B45309", "#4D7C0F", "#FBF6EC"],
  },
  {
    id: "maasai",
    name: "Maasai Mara",
    description: "Red ochre and shuka red",
    swatches: ["#B91C1C", "#1D4ED8", "#FBF3F0"],
  },
  {
    id: "serengeti",
    name: "Serengeti Dusk",
    description: "Sunset orange into violet",
    swatches: ["#C2410C", "#7C3AED", "#FDF4EE"],
  },
  {
    id: "kilimanjaro",
    name: "Kilimanjaro",
    description: "Glacier blue and slate",
    swatches: ["#0369A1", "#475569", "#F1F6FA"],
  },
  {
    id: "diani",
    name: "Diani Coast",
    description: "Turquoise water and sand",
    swatches: ["#0F766E", "#B45309", "#F0F8F7"],
  },
  {
    id: "rainforest",
    name: "Rainforest",
    description: "Deep Kakamega greens",
    swatches: ["#15803D", "#A16207", "#F1F7F1"],
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export const DEFAULT_THEME: ThemeId = "savannah";
export const THEME_STORAGE_KEY = "sd_theme";

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return !!value && THEMES.some((t) => t.id === value);
}

/** Read the persisted colour theme (client-side only). */
export function storedTheme(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}
