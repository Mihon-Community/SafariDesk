"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";

import type { Booking } from "@/lib/types";
import { formatDate, maskPhone } from "@/lib/format";
import { useUpdateBooking } from "@/hooks/useBookings";
import { DataTable, type BulkAction } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Money } from "@/components/Money";

const helper = createColumnHelper<Booking>();

/**
 * Desktop bookings table: sorting, search, column visibility, density,
 * row selection with bulk confirm/cancel and CSV export.
 */
export function BookingsTable({ data }: { data: Booking[] }) {
  const router = useRouter();
  const update = useUpdateBooking();

  const columns = useMemo<Array<ColumnDef<Booking, any>>>(
    () => [
      helper.accessor((row) => row.guest?.name ?? `Guest #${row.guestId}`, {
        id: "guest",
        header: "Guest",
        enableSorting: true,
        cell: ({ row }) => (
          <Link href={`/bookings/${row.original.id}`} className="block hover:underline">
            <span className="font-medium">{row.original.guest?.name ?? `Guest #${row.original.guestId}`}</span>
            <span className="block text-xs text-muted-foreground">
              {maskPhone(row.original.guest?.phone)}
            </span>
          </Link>
        ),
      }),
      helper.accessor("packageName", {
        header: "Package",
        cell: ({ getValue, row }) => getValue() ?? row.original.destinationName ?? `#${row.original.packageId ?? "pending"}`,
      }),
      helper.accessor((row) => `${row.startDate}|${row.endDate}`, {
        id: "dates",
        header: "Dates",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {formatDate(row.original.startDate)} – {formatDate(row.original.endDate)}
          </span>
        ),
      }),
      helper.accessor("pax", { header: "Pax", cell: ({ getValue }) => getValue() }),
      helper.accessor("total", {
        header: "Total",
        cell: ({ getValue, row }) => row.original.quoteStatus === "REQUESTED"
          ? <span className="text-muted-foreground">Quote pending</span>
          : <Money value={getValue()} plain />,
      }),
      helper.accessor("depositDue", {
        header: "Deposit due",
        cell: ({ getValue, row }) => row.original.quoteStatus === "REQUESTED"
          ? <span className="text-muted-foreground">-</span>
          : <Money value={getValue()} plain />,
      }),
      helper.accessor("status", {
        header: "Status",
        enableSorting: true,
        cell: ({ getValue }) => <StatusBadge status={getValue()} />,
      }),
    ],
    [],
  );

  const bulkActions: BulkAction<Booking>[] = useMemo(
    () => [
      {
        label: "Confirm selected",
        run: (rows) => {
          rows
            .filter((r) => ["PENDING", "DEPOSIT_PAID"].includes(r.status))
            .forEach((r) => update.mutate({ id: r.id, status: "CONFIRMED" }));
        },
      },
      {
        label: "Cancel selected",
        variant: "destructive",
        run: (rows) => {
          rows
            .filter((r) => !["COMPLETED", "CANCELLED"].includes(r.status))
            .forEach((r) => update.mutate({ id: r.id, status: "CANCELLED" }));
        },
      },
    ],
    [update],
  );

  return (
    <DataTable
      data={data}
      columns={columns}
      tableId="bookings"
      searchPlaceholder="Search guest, phone or package…"
      searchKeys={[
        "guest",
        "packageName",
        "status",
        "startDate",
        "endDate",
      ] as Array<keyof Booking>}
      exportName="bookings"
      exportHeaders={["Guest", "Package", "Start", "End", "Pax", "Total", "Deposit due", "Status"]}
      bulkActions={bulkActions}
      pageSizeOptions={[10, 25, 50]}
      onRowClick={(row) => router.push(`/bookings/${row.id}`)}
    />
  );
}
