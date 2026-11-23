import { AuthGate } from "@/components/AuthGate";

export default function AuthGroupLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AuthGate>{children}</AuthGate>;
}
