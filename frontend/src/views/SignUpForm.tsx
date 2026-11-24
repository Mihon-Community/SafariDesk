"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Car,
  Eye,
  EyeOff,
  Loader2,
  MailCheck,
  ShipWheel,
  UserRound,
  UsersRound,
  Wallet,
} from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { ROLE_HOME, SIGNUP_ROLES } from "@/lib/roles";
import type { Role } from "@/lib/permissions";
import type { SessionUser } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordStrength } from "@/components/auth/PasswordStrength";

const signUpSchema = z.object({
  name: z.string().min(2, "Your name is required"),
  email: z.string().email("Enter a valid email address"),
  phone: z
    .string()
    .regex(/^\+254\d{9}$/, "Use the format +254 7XX XXX XXX")
    .optional()
    .or(z.literal("")),
  password: z.string().min(8, "At least 8 characters"),
  licenceNumber: z.string().max(40).optional(),
  vehicleReg: z.string().max(24).optional(),
  company: z.string().max(120).optional(),
});

type Values = z.infer<typeof signUpSchema>;

const ROLE_ICONS: Record<string, typeof UserRound> = {
  customer: UserRound,
  driver: Car,
  agent: UsersRound,
  operations: ShipWheel,
  finance: Wallet,
};

/**
 * Public self-signup with role selection. Customer accounts go live at once;
 * staff roles are queued as pending and approved by an admin.
 */
export default function SignUpForm() {
  const router = useRouter();
  const [step, setStep] = useState<"role" | "form">("role");
  const [role, setRole] = useState<Role>("customer");
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const selected = SIGNUP_ROLES.find((r) => r.role === role)!;
  const needsApproval = selected.needsApproval;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
      licenceNumber: "",
      vehicleReg: "",
      company: "",
    },
  });
  const password = watch("password") ?? "";

  async function onSubmit(values: Values) {
    try {
      const res = await api<{ user: SessionUser; pending: boolean }>("/api/auth/sign-up", {
        method: "POST",
        body: { ...values, requestedRole: role },
      });
      if (res.pending) {
        setPendingRole(role);
        toast.success("Request sent");
        return;
      }
      toast.success(`Welcome, ${(res.user.name ?? res.user.email).split(" ")[0]}`);
      router.push(ROLE_HOME[res.user.role]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create the account");
    }
  }

  if (pendingRole) {
    return (
      <div className="space-y-3 text-center text-sm">
        <MailCheck className="mx-auto h-8 w-8 text-primary" aria-hidden />
        <p className="font-medium">Request sent</p>
        <p className="text-muted-foreground">
          An admin will review your request for the{" "}
          <span className="font-medium text-foreground">{pendingRole}</span> role. We&apos;ll
          notify you by SMS or email once it&apos;s decided.
        </p>
        <Button variant="outline" className="w-full" onClick={() => router.push("/sign-in")}>
          Back to sign in
        </Button>
      </div>
    );
  }

  if (step === "role") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">What brings you to SafariDesk?</p>
        <div role="radiogroup" aria-label="Choose your role" className="grid gap-2 sm:grid-cols-2">
          {SIGNUP_ROLES.map((item) => {
            const Icon = ROLE_ICONS[item.role] ?? UserRound;
            const active = role === item.role;
            return (
              <button
                key={item.role}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setRole(item.role)}
                className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? "border-primary bg-accent/10"
                    : "bg-card hover:border-primary/40"
                }`}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{item.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
        <Button className="w-full" onClick={() => setStep("form")}>
          Continue as {selected.title}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Already registered?{" "}
          <Link href="/sign-in" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          Signing up as <span className="text-primary">{selected.title}</span>
        </p>
        <button
          type="button"
          onClick={() => setStep("role")}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Change
        </button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Full name</Label>
        <Input id="name" autoComplete="name" {...register("name")} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          placeholder="+254 7XX XXX XXX"
          autoComplete="tel"
          {...register("phone")}
        />
        {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
      </div>

      {role === "driver" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="licenceNumber">Licence number</Label>
            <Input id="licenceNumber" {...register("licenceNumber")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicleReg">Vehicle registration</Label>
            <Input id="vehicleReg" placeholder="KDA 101A" {...register("vehicleReg")} />
          </div>
        </div>
      )}

      {needsApproval && (
        <div className="space-y-2">
          <Label htmlFor="company">Company / invite code (optional)</Label>
          <Input id="company" {...register("company")} />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
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
        <PasswordStrength password={password} />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {isSubmitting ? "Please wait…" : needsApproval ? "Send access request" : "Create account"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Already registered?{" "}
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
