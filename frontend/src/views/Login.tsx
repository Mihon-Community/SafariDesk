"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  CarFront,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import type { SessionUser } from "@/store/auth";
import { canOpenRoute } from "@/lib/route-permissions";
import { DEMO_ACCOUNTS, ROLE_HOME, SIGN_IN_GROUPS } from "@/lib/roles";
import type { SignInGroup } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginValues = z.infer<typeof loginSchema>;

const GROUP_ROLES: Record<SignInGroup, string[]> = {
  traveller: ["customer"],
  driver: ["driver"],
  staff: ["agent", "operations", "dispatcher", "finance"],
  admin: ["admin", "super_admin"],
};

function homeFor(role: string): string {
  return ROLE_HOME[role as keyof typeof ROLE_HOME] ?? "/dashboard";
}

export default function Login() {
  const setSession = useAuth((s) => s.setSession);
  const router = useRouter();
  // Read the redirect target on the client instead of useSearchParams(): the
  // latter suspends this static page behind a hidden boundary when Next sends
  // a visitor here from a protected route (?next=…), hiding the whole form.
  const [next, setNext] = useState<string | null>(null);
  useEffect(() => {
    setNext(new URLSearchParams(window.location.search).get("next"));
  }, []);
  const [group, setGroup] = useState<SignInGroup>("traveller");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function signIn(values: LoginValues, demo = false) {
    setFormError(null);
    if (demo) setBusyEmail(values.email);
    try {
      const res = await api<{ user: SessionUser }>("/api/auth/sign-in", {
        method: "POST",
        body: values,
      });
      // Cookies carry the session; the user object feeds the UI.
      setSession(res.user);
      const home = homeFor(res.user.role);
      // Honour a deep link only when it belongs to the role we actually signed
      // in as — otherwise every role falls back to the operator dashboard.
      const deepLink =
        next &&
        next.startsWith("/") &&
        !next.startsWith("/sign-") &&
        (next === home || next.startsWith(`${home}/`)) &&
        canOpenRoute(res.user.role, next);
      const target = deepLink ? next : home;

      const expected = GROUP_ROLES[group];
      if (!expected.includes(res.user.role)) {
        toast.info(`Signed in as ${res.user.role}`);
      } else {
        toast.success(`Welcome back, ${(res.user.name ?? res.user.email).split(" ")[0]}`);
      }
      router.push(target);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Sign-in failed";
      setFormError(message);
      toast.error(message);
    } finally {
      setBusyEmail(null);
    }
  }

  const hint = SIGN_IN_GROUPS.find((g) => g.id === group)?.hint;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label id="signin-group-label" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Sign in as
          </Label>
          <span className="text-[11px] text-muted-foreground">Hint only · role comes from your account</span>
        </div>
        <div
          role="radiogroup"
          aria-labelledby="signin-group-label"
          className="grid grid-cols-2 gap-1 rounded-xl border bg-muted/50 p-1 shadow-sm sm:grid-cols-4"
        >
          {SIGN_IN_GROUPS.map((item) => {
            const Icon =
              item.id === "driver" ? CarFront : item.id === "staff" ? UsersRound : item.id === "admin" ? ShieldCheck : UserRound;
            const active = group === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setGroup(item.id)}
                className={`flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row ${
                  active
                    ? "bg-brand text-brand-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-card hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </button>
            );
          })}
        </div>
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{hint}</p>
      </div>

      <form onSubmit={handleSubmit((values) => signIn(values))} className="space-y-4" noValidate>
        {formError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          >
            {formError}
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="email" type="email" autoComplete="email" className="pl-9" {...register("email")} />
          </div>
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="password">Password</Label>
            <a href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </a>
          </div>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className="pl-9 pr-10"
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>

        <Button type="submit" className="w-full gap-2" disabled={isSubmitting || busyEmail !== null}>
          {(isSubmitting || busyEmail) && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? "Signing in…" : "Sign in"}
          {!isSubmitting && !busyEmail && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>

      {process.env.NODE_ENV !== "production" && (
        <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Demo accounts</p>
            <p className="text-[11px] text-muted-foreground">One click → role home</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((account) => {
              const busy = busyEmail === account.email;
              return (
                <button
                  key={account.email}
                  type="button"
                  disabled={busyEmail !== null}
                  onClick={() => {
                    setValue("email", account.email);
                    setValue("password", account.password);
                    void signIn({ email: account.email, password: account.password }, true);
                  }}
                  className="group rounded-lg border bg-card px-2.5 py-2 text-left transition-colors hover:border-primary hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold capitalize">{account.role}</span>
                    {busy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ArrowRight className="h-3 w-3 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                    {homeFor(account.role)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
