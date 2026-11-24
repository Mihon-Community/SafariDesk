#!/usr/bin/env node
/**
 * Verifies the WCAG contrast contracts documented in
 * docs/prompts/theme-and-components-prompt.md against the real token values in
 * src/app/globals.css. Run directly or through `npm run lint`.
 *
 * Thresholds: foreground/background >= 14, muted-foreground/card >= 6.4,
 * primary-foreground/primary >= 5, primary & accent on background >= 4.6,
 * sidebar-foreground/sidebar >= 10.9.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.resolve(here, "../src/app/globals.css");
const css = readFileSync(cssPath, "utf8");

function hexToRgb(hex) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a, b) {
  const la = luminance(hexToRgb(a));
  const lb = luminance(hexToRgb(b));
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Extract {theme, mode, tokens{}} for every [data-theme=...] block. */
function parseThemes(source) {
  const out = [];
  const re = /\[data-theme="([\w-]+)"\](\.dark)?\s*\{([^}]*)\}/g;
  let match;
  while ((match = re.exec(source))) {
    const [, id, dark, body] = match;
    const tokens = {};
    for (const line of body.split("\n")) {
      const m = /--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/.exec(line.trim());
      if (m) tokens[m[1]] = m[2];
    }
    out.push({ id, mode: dark ? "dark" : "light", tokens });
  }
  return out;
}

const CHECKS = [
  ["foreground on background", "foreground", "background", 14],
  ["muted text on card", "muted-foreground", "card", 6.4],
  ["button text on primary", "primary-foreground", "primary", 5],
  ["primary on background", "primary", "background", 4.6],
  ["accent on background", "accent", "background", 4.6],
  ["sidebar text", "sidebar-foreground", "sidebar", 10.9],
];

const themes = parseThemes(css);
if (themes.length === 0) {
  console.error("check-contrast: no theme blocks found in globals.css");
  process.exit(1);
}

let failures = 0;
for (const { id, mode, tokens } of themes) {
  for (const [label, fgKey, bgKey, threshold] of CHECKS) {
    const r = ratio(tokens[fgKey], tokens[bgKey]);
    if (r === null) {
      console.error(`✗ ${id}/${mode}: missing hex for --${fgKey} or --${bgKey}`);
      failures += 1;
      continue;
    }
    const ok = r >= threshold;
    if (!ok) failures += 1;
    console.log(
      `${ok ? "✓" : "✗"} ${id}/${mode} ${label}: ${r.toFixed(2)} (need ${threshold})`,
    );
  }
}

if (failures > 0) {
  console.error(`\ncheck-contrast failed with ${failures} violation(s).`);
  process.exit(1);
}
console.log(`\ncheck-contrast passed across ${themes.length} theme blocks.`);
