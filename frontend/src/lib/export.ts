/** Small client-side CSV helpers used by the dashboard tables and charts. */

function escapeCell(value: string | number): string {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCSV(headers: string[], rows: Array<Array<string | number>>): string {
  const body = rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
  return `${headers.join(",")}\r\n${body}`;
}

export function downloadCSV(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const blob = new Blob(["﻿" + toCSV(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** 1.2M / 845K style abbreviations for axis labels. */
export function abbreviate(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}K`;
  return String(Math.round(value));
}
