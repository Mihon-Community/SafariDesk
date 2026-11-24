import bcrypt from "bcrypt";

import { config } from "../config";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.bcryptRounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** zod-style helpers shared by the auth schemas. */
export const passwordRules = {
  minLength: 8,
  maxLength: 128,
} as const;

/** Cheap strength estimate for the UI meter; the server enforces min length. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(4, Math.max(0, score - 1)) as 0 | 1 | 2 | 3 | 4;
}
