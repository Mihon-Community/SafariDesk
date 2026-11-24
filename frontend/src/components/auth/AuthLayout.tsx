import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Split-screen auth layout (Phase 7): park photo on the left, form card on the
 * right. Stacks vertically on phones; the photo panel is decorative.
 */
export function AuthLayout({
  children,
  title,
  description,
  image = "/images/parks/maasai-mara-landscape.jpg",
  imageAlt = "Maasai Mara landscape at golden hour",
}: {
  children: ReactNode;
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
}) {
  return (
    <div className="grid min-h-dvh bg-card lg:grid-cols-2">
      {/* Photo panel */}
      <div className="relative hidden lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={imageAlt} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-10 text-white">
          <p className="text-sm uppercase tracking-widest text-white/70">SafariDesk</p>
          <h1 className="mt-2 max-w-md text-3xl font-semibold leading-tight">{title}</h1>
          <p className="mt-3 max-w-md text-sm text-white/80">{description}</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-brand px-4 py-10 sm:px-8">
        <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-lg sm:p-8">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-base font-bold text-accent-foreground">
              S
            </div>
            <span className="text-base font-semibold">SafariDesk</span>
          </div>
          <h2 className="text-xl font-semibold sm:hidden">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground sm:hidden">{description}</p>
          <div className="mt-6 space-y-4">{children}</div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Operator access only. Guests use SMS, USSD and voice.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Footer links shared by auth pages. */
export function AuthLinks({ children }: { children: ReactNode }) {
  return <p className="text-center text-xs text-muted-foreground">{children}</p>;
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-primary hover:underline">
      {children}
    </Link>
  );
}
