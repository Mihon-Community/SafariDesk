import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "SafariDesk — Safari & Tour Operations",
  description:
    "Quoting, M-Pesa deposits, driver dispatch and safety alerts for Kenyan tour operators.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
