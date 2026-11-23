import { forwardRef, useEffect, useState } from "react";
import { normalizePhone } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Phone field for Kenya numbers. Accepts 07.. / 01.. / +254.. / 7.. and always
 * reports E.164 (+254...) up to the form, which is what the API stores.
 */
export const PhoneInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { value?: string; onChange?: (v: string) => void }
>(function PhoneInput({ className, value, onChange, ...props }, ref) {
  const [raw, setRaw] = useState(value ?? "");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (value !== undefined) setRaw(value);
  }, [value]);

  const display = touched && raw ? normalizePhone(raw) : raw;
  const invalid =
    touched && raw.trim() !== "" && normalizePhone(raw).replace(/\D/g, "").length < 9;

  return (
    <input
      ref={ref}
      inputMode="tel"
      autoComplete="tel"
      placeholder="0712 345 678"
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
        invalid && "border-destructive focus:ring-destructive",
        className,
      )}
      {...props}
      value={display}
      onFocus={(e) => {
        setRaw(e.target.value);
        props.onFocus?.(e);
      }}
      onChange={(e) => {
        setRaw(e.target.value);
        onChange?.(normalizePhone(e.target.value));
      }}
      onBlur={(e) => {
        setTouched(true);
        onChange?.(normalizePhone(e.target.value));
        props.onBlur?.(e);
      }}
    />
  );
});
