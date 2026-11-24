"use client";

const LABELS = ["Too weak", "Weak", "Fair", "Good", "Strong"] as const;

/** Live password strength meter used by sign-up / reset forms. */
export function PasswordStrength({ password }: { password: string }) {
  const score = scorePassword(password);
  if (!password) return null;

  return (
    <div className="space-y-1" aria-label={`Password strength: ${LABELS[score]}`}>
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((step) => (
          <span
            key={step}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              step < score + 1 ? barColor(score) : "bg-muted"
            }`}
          />
        ))}
      </div>
      <p className={`text-[11px] ${textColor(score)}`}>{LABELS[score]}</p>
    </div>
  );
}

function scorePassword(password: string): 0 | 1 | 2 | 3 | 4 {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(4, Math.max(0, score - 1)) as 0 | 1 | 2 | 3 | 4;
}

function barColor(score: number): string {
  if (score <= 1) return "bg-destructive";
  if (score === 2) return "bg-warning";
  return "bg-emerald-500";
}

function textColor(score: number): string {
  if (score <= 1) return "text-destructive";
  if (score === 2) return "text-warning";
  return "text-emerald-600 dark:text-emerald-400";
}
