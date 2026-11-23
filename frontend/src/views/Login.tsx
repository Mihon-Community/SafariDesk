"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import type { LoginResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function Login() {
  const setSession = useAuth((s) => s.setSession);
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("next") ?? "/dashboard";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    try {
      const res = await api<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: values,
      });
      setSession(res.token, res.user);
      toast.success("Signed in");
      router.push(from);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Sign-in failed");
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-brand p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-lg font-bold text-accent-foreground">
            S
          </div>
          <CardTitle className="text-xl">SafariDesk</CardTitle>
          <CardDescription>Sign in to the operator dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Demo instance: use the ADMIN_EMAIL and ADMIN_PASSWORD from your server config.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
