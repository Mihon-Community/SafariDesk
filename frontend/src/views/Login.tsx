"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, ShieldCheck, UserRound, UsersRound, CarFront } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import type { SessionUser } from "@/store/auth";
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

export default function Login() {
  const setSession = useAuth((s) => s.setSession);
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const [group, setGroup] = useState<SignInGroup>("traveller");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [demoSigningIn, setDemoSigningIn] = useState<(typeof DEMO_ACCOUNTS)[number]["role"] | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function signIn(values: LoginValues, selectedGroup: SignInGroup) {
    setFormError(null);
    try {
      const res = await api<{ user: SessionUser }>("/api/auth/sign-in", {
        method: "POST",
        body: values,
      });
      // Cookies carry the session; the user object feeds the UI.
      setSession(res.user);
      const expected = GROUP_ROLES[selectedGroup];
      if (!expected.includes(res.user.role)) {
        toast.info(`Signed in as ${res.user.role}`);
      } else {
        toast.success(`Welcome back, ${(res.user.name ?? res.user.email).split(" ")[0]}`);
      }
      // The backend's role decides where you land — never the segmented control.
      if (next && next.startsWith("/") && !next.startsWith("/sign-")) {
        router.push(next);
      } else {
        router.push(ROLE_HOME[res.user.role]);
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Sign-in failed";
      setFormError(message);
      toast.error(message);
    }
  }

  function onSubmit(values: LoginValues) {
    return signIn(values, group);
  }

  async function signInAsDemo(account: (typeof DEMO_ACCOUNTS)[number]) {
    const selectedGroup: SignInGroup =
      account.role === "customer"
        ? "traveller"
        : account.role === "driver"
          ? "driver"
          : account.role === "admin" || account.role === "super_admin"
            ? "admin"
            : "staff";
    setGroup(selectedGroup);
    setDemoSigningIn(account.role);
    try {
      await signIn(account, selectedGroup);
    } finally {
      setDemoSigningIn(null);
    }
  }

  const hint = SIGN_IN_GROUPS.find((g) => g.id === group)?.hint;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label id="signin-group-label" className="text-xs uppercase tracking-wide text-muted-foreground">
          Sign in as
        </Label>
        <div
          role="radiogroup"
          aria-labelledby="signin-group-label"
          className="grid grid-cols-2 gap-1 rounded-xl border bg-muted/40 p-1 sm:grid-cols-4"
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
                className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {item.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {formError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {formError}
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <a href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              Forgot?
            </a>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className="pr-10"
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting || demoSigningIn !== null}>
          {(isSubmitting || demoSigningIn !== null) && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting || demoSigningIn !== null ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {process.env.NODE_ENV !== "production" && (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">Demo accounts (dev only — click to sign in)</p>
          <div className="flex flex-wrap gap-1.5">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => void signInAsDemo(account)}
                disabled={isSubmitting || demoSigningIn !== null}
                className="rounded-full border px-2.5 py-1 text-xs transition-colors hover:border-primary hover:text-primary disabled:cursor-wait disabled:opacity-60"
              >
                {demoSigningIn === account.role && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
                {account.role}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
