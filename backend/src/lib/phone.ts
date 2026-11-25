/** Normalize Kenyan mobile numbers to the international format used by AT. */
export function normalizeKenyanPhone(input: string): string | null {
  const compact = input.trim().replace(/[\s()-]/g, "");
  let candidate: string;

  if (/^0[17]\d{8}$/.test(compact)) {
    candidate = `+254${compact.slice(1)}`;
  } else if (/^254[17]\d{8}$/.test(compact)) {
    candidate = `+${compact}`;
  } else if (/^\+254[17]\d{8}$/.test(compact)) {
    candidate = compact;
  } else {
    return null;
  }

  return candidate;
}

/** Callback numbers must already be E.164; never guess their country. */
export function isKenyanE164Phone(input: string): boolean {
  return /^\+254[17]\d{8}$/.test(input);
}

/** Return only a small operational label; callers must not log raw phone data. */
export function maskPhone(phone: string): string {
  return `…${phone.slice(-3)}`;
}
