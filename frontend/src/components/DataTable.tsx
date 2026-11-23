"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Download, EyeOff, Rows3, SlidersHorizontal } from "lucide-react";

import { downloadCSV } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/States";

export interface BulkAction<T> {
  label: string;
  variant?: "default" | "destructive";
  run: (rows: T[]) => void | Promise<void>;
}

interface DataTableProps<T> {
  data: T[];
  columns: Array<ColumnDef<T, any>>;
  /** Stable id used to persist column visibility / density per table. */
  tableId: string;
  searchPlaceholder?: string;
  searchKeys?: Array<keyof T>;
  exportName?: string;
  exportHeaders?: string[];
  /** Default page size options. */
  pageSizeOptions?: number[];
  bulkActions?: BulkAction<T>[];
  emptyState?: React.ReactNode;
  footer?: React.ReactNode;
  /** Hide the built-in tools (search/density/columns) — callers may bring their own. */
  bare?: boolean;
  onRowClick?: (row: T) => void;
}

/**
 * Shared data table: sorting, global search, column visibility, density,
 * row selection with bulk actions, CSV export, pagination and a persisted
 * view (column visibility + density) per table.
 */
export function DataTable<T extends { id?: number | string }>({
  data,
  columns,
  tableId,
  searchPlaceholder = "Search…",
  searchKeys,
  exportName,
  exportHeaders = [],
  pageSizeOptions = [10, 25, 50],
  bulkActions,
  emptyState,
  footer,
  bare,
  onRowClick,
}: DataTableProps<T>) {
  const storageKey = `datatable:${tableId}`;
  const [sorting, setSorting] = useState<Array<{ id: string; desc: boolean }>>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [selected, setSelected] = useState<Set<number | string>>(new Set());

  // Restore the saved view once, after mount, so SSR markup matches.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { visibility?: Record<string, boolean>; density?: typeof density };
      if (saved.visibility) setColumnVisibility(saved.visibility);
      if (saved.density) setDensity(saved.density);
    } catch {
      /* ignore malformed storage */
    }
  }, [storageKey]);

  function saveView(next: Record<string, boolean>, nextDensity: typeof density) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ visibility: next, density: nextDensity }));
    } catch {
      /* storage unavailable */
    }
  }

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnVisibility },
    enableRowSelection: !!bulkActions?.length,
    enableMultiRowSelection: true,
    onSortingChange: (updater) =>
      setSorting(typeof updater === "function" ? updater(sorting) : updater),
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: searchKeys?.length
      ? (row, _columnId, value) => {
          const needle = String(value).toLowerCase();
          return searchKeys.some((key) =>
            String((row.original[key] as unknown) ?? "").toLowerCase().includes(needle),
          );
        }
      : undefined,
    onColumnVisibilityChange: (updater) => {
      const next =
        typeof updater === "function"
          ? updater(table.getState().columnVisibility)
          : updater;
      setColumnVisibility(next);
      saveView(next, density);
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const visibleRows = table.getPaginationRowModel().rows;
  const allSelected =
    visibleRows.length > 0 && visibleRows.every((row) => row.getIsSelected());

  const selectedRows = useMemo(
    () => data.filter((row) => row.id != null && selected.has(row.id)),
    [data, selected],
  );

  function toggleAll() {
    const next = new Set(selected);
    if (allSelected) visibleRows.forEach((r) => next.delete(r.original.id as never));
    else visibleRows.forEach((r) => next.add(r.original.id as never));
    setSelected(next);
  }

  function toggleOne(id: number | string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleColumn(key: string) {
    const next = { ...columnVisibility, [key]: !columnVisibility[key] };
    table.setColumnVisibility(next);
    saveView(next, density);
  }

  function changeDensity(next: "comfortable" | "compact") {
    setDensity(next);
    saveView(columnVisibility, next);
  }

  function exportCsv() {
    const headers = exportHeaders.length ? exportHeaders : table.getAllColumns().map((c) => c.id);
    const rows = table.getRowModel().rows.map((row) =>
      row.getVisibleCells().map((cell) => String(cell.getValue() ?? "")),
    );
    downloadCSV(`${exportName ?? tableId}.csv`, headers, rows);
  }

  const selectable = !!bulkActions?.length;
  const checkboxWidth = selectable ? "w-8" : "";

  return (
    <div className="space-y-3">
      {!bare && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          {bulkActions && selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/40 p-1">
              <span className="px-2 text-xs font-medium">{selected.size} selected</span>
              {bulkActions.map((action) => (
                <Button
                  key={action.label}
                  size="sm"
                  variant={action.variant === "destructive" ? "destructive" : "outline"}
                  onClick={() => {
                    void action.run(selectedRows);
                    setSelected(new Set());
                  }}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-72 overflow-auto">
                <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {table.getAllColumns().map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={() => toggleColumn(column.id)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {String(column.columnDef.header ?? column.id)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Rows3 className="h-3.5 w-3.5" /> Density
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Row density</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={density === "comfortable"}
                  onCheckedChange={() => changeDensity("comfortable")}
                >
                  Comfortable
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={density === "compact"}
                  onCheckedChange={() => changeDensity("compact")}
                >
                  Compact
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {exportName && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}>
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            )}
          </div>
        </div>
      )}

      <div className={`overflow-x-auto rounded-lg border ${bare ? "" : ""}`}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {selectable && (
                  <TableHead className={checkboxWidth}>
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all rows"
                    />
                  </TableHead>
                )}
                {group.headers.map((header) => (
                  <TableHead key={header.id} className={density === "compact" ? "py-1.5" : ""}>
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={header.column.getToggleSortingHandler()}
                        aria-sort={
                          header.column.getIsSorted() === "asc"
                            ? "ascending"
                            : header.column.getIsSorted() === "desc"
                              ? "descending"
                              : "none"
                        }
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span aria-hidden>
                          {header.column.getIsSorted() === "asc"
                            ? "▲"
                            : header.column.getIsSorted() === "desc"
                              ? "▼"
                              : ""}
                        </span>
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + (selectable ? 1 : 0)}>
                  {emptyState ?? <EmptyState title="Nothing here yet" />}
                </TableCell>
              </TableRow>
            )}
            {visibleRows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                className={`${density === "compact" ? "text-xs" : ""} ${onRowClick ? "cursor-pointer" : ""}`}
                onClick={
                  onRowClick
                    ? (e) => {
                        const target = e.target as HTMLElement | null;
                        // ignore clicks inside controls (checkbox, buttons, links)
                        if (target?.closest("input,button,a")) return;
                        onRowClick(row.original);
                      }
                    : undefined
                }
              >
                {selectable && (
                  <TableCell>
                    <Checkbox
                      checked={row.getIsSelected()}
                      onCheckedChange={() => row.original.id != null && toggleOne(row.original.id)}
                      aria-label={`Select row ${row.index + 1}`}
                    />
                  </TableCell>
                )}
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={
                      cell.column.getIsVisible() === false ? "hidden" : density === "compact" ? "py-1.5" : ""
                    }
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {footer}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>
          {data.length} record{data.length === 1 ? "" : "s"}
          {globalFilter ? ` · matching "${globalFilter}"` : ""}
        </p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5">
            Rows
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="h-7 rounded border bg-transparent px-1"
            >
              {(pageSizeOptions ?? [10, 25, 50]).map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Prev
          </Button>
          <span className="tabular-nums">
            {table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>

      {columnVisibility && Object.values(columnVisibility).some(Boolean) === false && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <EyeOff className="h-3.5 w-3.5" /> All columns hidden — use Columns to show some.
        </p>
      )}
    </div>
  );
}
