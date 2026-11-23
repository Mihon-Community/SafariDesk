"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Use at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/reset-password", { method: "POST", body: { token, password } });
      toast.success("Password updated");
      router.push("/sign-in");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy || !token}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Set new password
      </Button>
      {!token && (
        <p className="text-center text-xs text-muted-foreground">
          Missing or expired token — request a fresh link from{" "}
          <Link href="/forgot-password" className="text-primary hover:underline">
            forgot password
          </Link>
          .
        </p>
      )}
    </form>
  );
}
