import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** True if the app is running against MSW mock handlers. */
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
