import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "SafariDesk — Safari & Tour Operations",
  description:
    "Quoting, M-Pesa deposits, driver dispatch and safety alerts for Kenyan tour operators.",
};

/**
 * Applies the persisted palette/mode before first paint so there is no flash of
 * unthemed content (and no black-on-transparent page with scripts disabled).
 * next-themes stores its mode under `theme`; the palette lives under `sd_theme`.
 * next/script injects it into <head> with a known execution order, so React
 * doesn't complain about a raw <script> under <html>.
 */
const PRE_PAINT = `(function(){try{
  var doc=document.documentElement;
  var theme=localStorage.getItem('sd_theme');
  if(!theme||!/^(savannah|maasai|serengeti|kilimanjaro|diani|rainforest)$/.test(theme)){theme='savannah';}
  doc.setAttribute('data-theme',theme);
  var mode=localStorage.getItem('theme')||'system';
  var dark=mode==='dark'||(mode==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
  if(dark){doc.classList.add('dark');}else{doc.classList.remove('dark');}
}catch(e){doc.setAttribute('data-theme','savannah');}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning data-theme="savannah">
      <body>
        <Script
          id="sd-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: PRE_PAINT }}
        />
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
