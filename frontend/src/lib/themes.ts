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
    swatches: ["#006933", "#a75c00", "#faf6ee"],
  },
  {
    id: "maasai",
    name: "Maasai Mara",
    description: "Red ochre and shuka red",
    swatches: ["#a50013", "#b64e10", "#fbf3ec"],
  },
  {
    id: "serengeti",
    name: "Serengeti Dusk",
    description: "Sunset orange into violet",
    swatches: ["#982900", "#9b49ae", "#f9f0ea"],
  },
  {
    id: "kilimanjaro",
    name: "Kilimanjaro",
    description: "Glacier blue and slate",
    swatches: ["#005e82", "#2a7f88", "#f2f7fa"],
  },
  {
    id: "diani",
    name: "Diani Coast",
    description: "Turquoise water and sand",
    swatches: ["#00686a", "#ae5528", "#f3f6f3"],
  },
  {
    id: "rainforest",
    name: "Rainforest",
    description: "Deep Kakamega greens",
    swatches: ["#006647", "#887000", "#f2f7f1"],
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
