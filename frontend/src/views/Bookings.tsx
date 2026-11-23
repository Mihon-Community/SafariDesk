"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { useBookings } from "@/hooks/useBookings";
import { BOOKING_STATUSES, type BookingStatus } from "@/lib/types";
import { formatDate, maskPhone } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Money } from "@/components/Money";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/States";

export default function Bookings() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const status = searchParams.get("status") ?? "";
  const urlQ = searchParams.get("q") ?? "";

  const [search, setSearch] = useState(urlQ);
  const debouncedQ = useDebounced(search, 350);

  /** Next has no setParams; replace the query string through the router. */
  function applyParams(next: URLSearchParams) {
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if (debouncedQ !== urlQ) {
      const next = new URLSearchParams(searchParams.toString());
      if (debouncedQ) next.set("q", debouncedQ);
      else next.delete("q");
      applyParams(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  function setStatus(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value && value !== "ALL") next.set("status", value);
    else next.delete("status");
    applyParams(next);
  }

  const { data, isLoading, isError, error, refetch } = useBookings({
    status: status || undefined,
    q: debouncedQ || undefined,
  });

  const counts = useMemo(() => {
    const map: Partial<Record<BookingStatus, number>> = {};
    for (const b of data ?? []) map[b.status] = (map[b.status] ?? 0) + 1;
    return map;
  }, [data]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bookings"
        description="Every quote becomes one record, tracked from deposit to dispatch."
        actions={
          <Link href="/bookings/new">
            <Button>New booking</Button>
          </Link>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search guest, phone or package…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status || "ALL"} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {BOOKING_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(status || search) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              router.replace(pathname, { scroll: false });
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {counts && Object.keys(counts).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {BOOKING_STATUSES.filter((s) => counts[s]).map((s) => (
            <button key={s} onClick={() => setStatus(s)} className="transition-opacity hover:opacity-70">
              <Badge variant="outline" className="gap-1.5 px-2.5 py-1">
                {s.replace(/_/g, " ")}
                <span className="font-semibold">{counts[s]}</span>
              </Badge>
            </button>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading && <TableSkeleton rows={6} />}
          {isError && (
            <div className="p-4">
              <ErrorState
                message={error instanceof Error ? error.message : "Request failed"}
                onRetry={() => refetch()}
              />
            </div>
          )}
          {data && data.length === 0 && (
            <div className="p-4">
              <EmptyState
                title="No bookings found"
                description="Try a different filter, or create a new booking."
                action={
                  <Link href="/bookings/new">
                    <Button size="sm">New booking</Button>
                  </Link>
                }
              />
            </div>
          )}
          {data && data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guest</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-right">Pax</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Deposit due</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link href={`/bookings/${b.id}`} className="block hover:underline">
                        <span className="font-medium">{b.guest?.name ?? `Guest #${b.guestId}`}</span>
                        <span className="block text-xs text-muted-foreground">
                          {maskPhone(b.guest?.phone)}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>{b.packageName ?? `#${b.packageId}`}</TableCell>
                    <TableCell>
                      {formatDate(b.startDate)} – {formatDate(b.endDate)}
                    </TableCell>
                    <TableCell className="text-right">{b.pax}</TableCell>
                    <TableCell className="text-right">
                      <Money value={b.total} plain />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={b.depositDue} plain />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={b.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
