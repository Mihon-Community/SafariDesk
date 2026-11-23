import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Send, CheckCircle2 } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { useCreateBooking, usePayBooking } from "@/hooks/useBookings";
import { useQuote } from "@/hooks/useQuote";
import type { Booking, Package, Residency } from "@/lib/types";
import { RESIDENCIES } from "@/lib/types";
import { addDaysISO, formatDate, formatMoney, todayISO } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { PhoneInput } from "@/components/PhoneInput";
import { Money } from "@/components/Money";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const bookingSchema = z.object({
  guestName: z.string().min(2, "Guest name is required"),
  phone: z
    .string()
    .refine((v) => v.replace(/\D/g, "").length >= 9, "Enter a valid Kenyan phone number"),
  packageId: z.coerce.number().positive("Choose a package"),
  startDate: z.string().min(1, "Choose a start date"),
  pax: z.coerce.number().int().min(1, "At least 1 person").max(50, "Maximum 50 people"),
  residency: z.enum(["citizen", "resident", "non_resident"]),
  depositPct: z.coerce.number().int().min(10).max(100),
});

type BookingFormValues = z.infer<typeof bookingSchema>;
// z.coerce fields accept anything as input; the resolver needs the input type.
type BookingFormInput = z.input<typeof bookingSchema>;

export default function NewBooking() {
  const packagesQuery = useQuery({
    queryKey: ["rates", "packages"],
    queryFn: () => api<Package[]>("/api/rates/packages"),
  });

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormInput>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      guestName: "",
      phone: "",
      packageId: 0,
      startDate: addDaysISO(7),
      pax: 2,
      residency: "citizen",
      depositPct: 30,
    },
  });

  const values = watch();
  const quoteInput = useMemo(
    () => ({
      packageId: Number(values.packageId) || undefined,
      pax: Number(values.pax) || undefined,
      residency: values.residency as Residency,
      start: values.startDate || undefined,
      depositPct: Number(values.depositPct) || undefined,
    }),
    [values],
  );

  const quote = useQuote(quoteInput);
  const quoteReady = !!quote.data;
  const quoteMissing =
    !!(quoteInput.packageId && quoteInput.pax && quoteInput.residency && quoteInput.start) &&
    !quote.isLoading &&
    !quote.data;

  const createBooking = useCreateBooking();
  const payBooking = usePayBooking();
  const [created, setCreated] = useState<Booking | null>(null);

  async function onSubmit(v: BookingFormInput) {
    try {
      const booking = await createBooking.mutateAsync({
        guestName: v.guestName,
        phone: v.phone,
        packageId: Number(v.packageId),
        startDate: v.startDate,
        pax: Number(v.pax),
        residency: v.residency,
        depositPct: Number(v.depositPct),
      });
      setCreated(booking);
      toast.success(`Booking #${booking.id} created`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create booking");
    }
  }

  async function sendPrompt() {
    if (!created) return;
    try {
      await payBooking.mutateAsync(created.id);
      toast.success("M-Pesa prompt sent", {
        description: "The guest should receive an STK push in a few seconds.",
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not send the prompt");
    }
  }

  /* ------------------------- confirmation state ------------------------- */
  if (created) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Booking created" />
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              <div>
                <p className="font-semibold">Booking #{created.id}</p>
                <p className="text-sm text-muted-foreground">
                  {created.packageName ?? "Package"} · {formatDate(created.startDate)} ·{" "}
                  {created.pax} pax
                </p>
              </div>
              <div className="ml-auto">
                <StatusBadge status={created.status} />
              </div>
            </div>

            <div className="rounded-lg border bg-secondary/50 p-4 text-sm">
              <div className="flex justify-between">
                <span>Total</span>
                <Money value={created.total} />
              </div>
              <div className="mt-1 flex justify-between font-medium">
                <span>Deposit due ({Number(values.depositPct)}%)</span>
                <Money value={created.depositDue} />
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={sendPrompt} disabled={payBooking.isPending}>
                {payBooking.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send M-Pesa prompt
              </Button>
              <Link to={`/bookings/${created.id}`}>
                <Button variant="outline" className="w-full sm:w-auto">
                  View booking
                </Button>
              </Link>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCreated(null);
              }}
            >
              Create another booking
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ------------------------------ form view ----------------------------- */
  return (
    <div className="space-y-4">
      <PageHeader
        title="New booking"
        description="Quote first — the operator can explain every line to the guest."
      />

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          {/* Left: guest + trip */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Guest and trip details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4 pt-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="guestName">Guest name</Label>
                  <Input
                    id="guestName"
                    placeholder="e.g. Amina Otieno"
                    {...register("guestName")}
                  />
                  {errors.guestName && (
                    <p className="text-xs text-destructive">{errors.guestName.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Controller
                    control={control}
                    name="phone"
                    render={({ field }) => (
                      <PhoneInput
                        id="phone"
                        value={field.value}
                        onChange={(v) => field.onChange(v)}
                      />
                    )}
                  />
                  {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="packageId">Package</Label>
                  <Controller
                    control={control}
                    name="packageId"
                    render={({ field }) => (
                      <Select
                        value={String(field.value ?? "")}
                        onValueChange={(v) => field.onChange(Number(v))}
                      >
                        <SelectTrigger id="packageId" className="w-full">
                          <SelectValue placeholder="Choose a package" />
                        </SelectTrigger>
                        <SelectContent>
                          {(packagesQuery.data ?? []).map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.name} · {p.days}d
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {packagesQuery.isLoading && (
                    <Skeleton className="h-4 w-40" />
                  )}
                  {errors.packageId && (
                    <p className="text-xs text-destructive">{errors.packageId.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    min={todayISO()}
                    {...register("startDate")}
                  />
                  {errors.startDate && (
                    <p className="text-xs text-destructive">{errors.startDate.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pax">People</Label>
                  <Input id="pax" type="number" min={1} max={50} {...register("pax")} />
                  {errors.pax && <p className="text-xs text-destructive">{errors.pax.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Residency</Label>
                  <Controller
                    control={control}
                    name="residency"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={(v) => field.onChange(v)}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RESIDENCIES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r === "non_resident"
                                ? "Non-resident"
                                : r.charAt(0).toUpperCase() + r.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    Park fees differ for citizens, residents and non-residents.
                  </p>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="depositPct">Deposit percentage (%)</Label>
                  <Input
                    id="depositPct"
                    type="number"
                    min={10}
                    max={100}
                    {...register("depositPct")}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Right: live quote */}
          <Card className="h-fit lg:sticky lg:top-6">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Live quote</CardTitle>
              <p className="text-xs text-muted-foreground">Updates as you type.</p>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              {quote.isLoading && (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-20 w-full" />
                </div>
              )}

              {!quote.isLoading && !quote.data && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {quoteMissing
                        ? "Could not compute this quote yet."
                        : "Choose a package, dates, pax and residency to see the price."}
                </p>
              )}

              {quote.data && (
                <div className="space-y-3 text-sm">
                  <dl className="space-y-1.5">
                    <Row label="Park fees" value={quote.data.breakdown.parkFees} />
                    {quote.data.breakdown.conservancy > 0 && (
                      <Row label="Conservancy" value={quote.data.breakdown.conservancy} />
                    )}
                    <Row label="Vehicle + driver" value={quote.data.breakdown.transport} />
                    <Row
                      label="Season adjustment"
                      value={quote.data.breakdown.seasonAdjustment}
                      signed
                    />
                    <Row label="Operator margin" value={quote.data.breakdown.margin} />
                  </dl>
                  <div className="border-t pt-2">
                    <div className="flex items-baseline justify-between">
                      <span className="font-medium text-muted-foreground">Total</span>
                      <span className="text-lg font-semibold">
                        <Money value={quote.data.total} />
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="font-medium text-muted-foreground">
                        Deposit due ({Number(values.depositPct)}%)
                      </span>
                      <span className="font-semibold text-primary">
                        {formatMoney(quote.data.depositDue)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <p className="mr-auto text-xs text-muted-foreground sm:mr-4">
            Submit stays disabled until a live quote exists.
          </p>
          <Button
            type="submit"
            disabled={!quoteReady || isSubmitting || createBooking.isPending}
          >
            {isSubmitting || createBooking.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Create booking
          </Button>
        </div>
      </form>
    </div>
  );
}

function Row({ label, value, signed = false }: { label: string; value: number; signed?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">
        {signed && value > 0 ? "+" : ""}
        {value.toLocaleString("en-KE")}
      </dd>
    </div>
  );
}
