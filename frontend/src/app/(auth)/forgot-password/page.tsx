"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({ email: z.string().email("Enter a valid email address") });

/** Phase 1 shell; Phase 7 adds the single-use reset token flow and SMS/email delivery. */
export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({ resolver: zodResolver(schema) });

  async function onSubmit(v: { email: string }) {
    try {
      await api("/api/auth/forgot-password", { method: "POST", body: v });
      setSent(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Request failed");
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-brand p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="items-center text-center">
          <CardTitle className="text-xl">Reset your password</CardTitle>
          <CardDescription>We will send a reset link to your email or phone.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-3 text-center text-sm">
              <p>If that account exists, a reset link is on its way.</p>
              <Link href="/sign-in">
                <Button variant="outline" className="w-full">
                  Back to sign in
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Send reset link
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
