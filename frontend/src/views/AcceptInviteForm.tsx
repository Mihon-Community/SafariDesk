"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function AcceptInviteFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/accept-invite", {
        method: "POST",
        body: { token, name, password },
      });
      toast.success("Invite accepted. You can now sign in.");
      router.push("/sign-in");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not accept this invite.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="invite-name">Name</Label>
        <Input id="invite-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required minLength={2} maxLength={80} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite-password">Create password</Label>
        <Input id="invite-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required minLength={8} maxLength={128} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite-confirm-password">Confirm password</Label>
        <Input id="invite-confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required minLength={8} maxLength={128} />
      </div>
      {!token && <p className="text-center text-xs text-muted-foreground">This invite link is missing its token. Ask your administrator to send it again.</p>}
      <Button type="submit" className="w-full" disabled={!token || busy}>
        {busy ? "Accepting invite…" : "Accept invite"}
      </Button>
    </form>
  );
}

export default function AcceptInviteForm() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteFormInner />
    </Suspense>
  );
}
