import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";

/**
 * Split-screen auth shell: park photo on large screens, a compact photo banner
 * on phones. The form card stays centered and readable from 320px to 4K.
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
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-2">
      {/* Phone photo banner */}
      <div className="relative h-36 sm:h-48 lg:hidden">
        <Image src={image} alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand via-brand/45 to-transparent" />
        <div className="absolute inset-x-0 bottom-3 flex items-center gap-2 px-4 text-brand-foreground">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground">
            S
          </span>
          <span className="text-sm font-semibold">SafariDesk</span>
          <span className="ml-auto text-[11px] text-brand-foreground/75">Operator workspace</span>
        </div>
      </div>

      {/* Full-height photo panel on laptops and TVs */}
      <div className="relative hidden min-h-dvh lg:block">
        <Image src={image} alt={imageAlt} fill priority sizes="50vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand via-brand/40 to-brand/10" />
        <div className="absolute inset-x-0 bottom-0 p-8 text-brand-foreground 3xl:p-14 4xl:p-20">
          <p className="inline-flex items-center gap-2 rounded-full border border-brand-foreground/25 bg-brand/30 px-3 py-1 text-[11px] font-medium uppercase tracking-widest backdrop-blur-sm 3xl:text-sm">
            Built in Kenya · for Kenyan operators
          </p>
          <h1 className="mt-4 max-w-xl text-3xl font-semibold leading-tight tracking-tight 3xl:max-w-3xl 3xl:text-5xl 4xl:text-6xl">
            {title}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-brand-foreground/85 3xl:max-w-3xl 3xl:text-lg 4xl:text-xl">
            {description}
          </p>
          <ul className="mt-6 flex flex-wrap gap-2 text-xs 3xl:text-sm">
            {["Quotes in minutes", "M-Pesa reconciliation", "Driver dispatch by SMS"].map((item) => (
              <li
                key={item}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand-foreground/25 bg-brand/25 px-3 py-1.5 backdrop-blur-sm"
              >
                <Check className="h-3.5 w-3.5 text-accent" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-start justify-center bg-muted/25 px-4 py-8 sm:px-6 sm:py-12 lg:items-center lg:bg-background lg:px-8 3xl:px-16">
        <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl shadow-brand/5 sm:p-7 3xl:max-w-xl 3xl:p-10 4xl:max-w-2xl 4xl:p-12">
          <div className="mb-5 flex items-center gap-2 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-foreground">
              S
            </span>
            <span className="text-base font-semibold">SafariDesk</span>
          </div>
          <div className="mb-6 lg:hidden">
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
          </div>
          {children}
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Travellers, drivers and operators — one record from quote to game drive.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Footer links shared by auth pages. */
export function AuthLinks({ children }: { children: ReactNode }) {
  return (
    <p className="mt-5 rounded-lg bg-muted/50 px-3 py-2.5 text-center text-xs text-muted-foreground">
      {children}
    </p>
  );
}

export function AuthLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="font-semibold text-primary hover:underline">
      {children}
    </Link>
  );
}
