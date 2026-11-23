"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, Send, Users } from "lucide-react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import type {
  AlertSeverity,
  AnalyticsSummary,
  CreateAlertInput,
  DraftAlertInput,
  DraftAlertResult,
  SafetyAlert,
} from "@/lib/types";
import { ALERT_SEVERITIES } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorState, EmptyState } from "@/components/States";

const ALERT_TYPES = [
  "Road closure",
  "Weather warning",
  "Wildlife sighting",
  "Health notice",
  "Park advisory",
  "Other",
];

export default function Alerts() {
  const qc = useQueryClient();
  const [type, setType] = useState(ALERT_TYPES[0]);
  const [severity, setSeverity] = useState<AlertSeverity>("WARNING");
  const [parkId, setParkId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [english, setEnglish] = useState("");
  const [swahili, setSwahili] = useState("");
  const [recipients, setRecipients] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reviewed, setReviewed] = useState(false);

  const parksQuery = useQuery({
    queryKey: ["rates", "parks"],
    queryFn: () => api<{ id: number; name: string }[]>("/api/rates/parks"),
  });

  const summaryQuery = useQuery({
    queryKey: ["summary"],
    queryFn: () => api<AnalyticsSummary>("/api/analytics/summary"),
  });

  const alertsQuery = useQuery({
    queryKey: ["alerts"],
    queryFn: () => api<SafetyAlert[]>("/api/alerts"),
  });

  const draft = useMutation({
    mutationFn: (input: DraftAlertInput) =>
      api<DraftAlertResult>("/api/ai/draft-alert", { method: "POST", body: input }),
    onSuccess: (res) => {
      setEnglish(res.english);
      setSwahili(res.swahili);
      setRecipients(res.recipientCount);
      toast.success("Draft ready — review before sending");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "AI draft failed"),
  });

  const send = useMutation({
    mutationFn: (input: CreateAlertInput) =>
      api<SafetyAlert>("/api/alerts", { method: "POST", body: input }),
    onSuccess: () => {
      toast.success("Alert broadcast started", {
        description: "Delivery status updates live below.",
      });
      setConfirmOpen(false);
      setDescription("");
      setEnglish("");
      setSwahili("");
      setReviewed(false);
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not send alert"),
  });

  const recipientCount = recipients ?? summaryQuery.data?.activeGuests ?? 0;
  const englishLen = english.length;
  const swahiliLen = swahili.length;
  const canSend = english.trim().length > 0 && recipientCount > 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Safety alerts"
        description="Broadcast to every guest on an active trip by SMS, and by Voice when critical."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Composer */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Compose alert</CardTitle>
            <p className="text-xs text-muted-foreground">
              The AI drafts; you approve. Nothing sends without your confirmation.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="description">What happened? (plain description)</Label>
              <Textarea
                id="description"
                placeholder="e.g. Mara River road closed after heavy rain, use the Sekenani gate instead"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALERT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Severity</Label>
                <Select value={severity} onValueChange={(v) => setSeverity(v as AlertSeverity)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALERT_SEVERITIES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Park (optional)</Label>
                <Select value={parkId} onValueChange={setParkId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All active trips" />
                  </SelectTrigger>
                  <SelectContent>
                    {(parksQuery.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                draft.mutate({
                  description,
                  type,
                  severity,
                  parkId: parkId ? Number(parkId) : null,
                })
              }
              disabled={!description.trim() || draft.isPending}
            >
              {draft.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Draft with AI
            </Button>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="english">English message</Label>
                <CharCount len={englishLen} />
              </div>
              <Textarea
                id="english"
                value={english}
                onChange={(e) => setEnglish(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="swahili">Ujumbe wa Kiswahili</Label>
                <CharCount len={swahiliLen} />
              </div>
              <Textarea
                id="swahili"
                value={swahili}
                onChange={(e) => setSwahili(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-secondary/50 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" /> Recipients
              </span>
              <span className="font-semibold">{recipientCount} guests</span>
            </div>

            <Button
              className="w-full"
              disabled={!canSend}
              onClick={() => {
                setReviewed(false);
                setConfirmOpen(true);
              }}
            >
              Review and send
            </Button>
          </CardContent>
        </Card>

        {/* Recent alerts */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Sent alerts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {alertsQuery.isLoading && <Skeleton className="m-4 h-48 w-[calc(100%-2rem)]" />}
            {alertsQuery.isError && (
              <div className="p-4">
                <ErrorState
                  message={alertsQuery.error instanceof Error ? alertsQuery.error.message : "Failed"}
                  onRetry={() => alertsQuery.refetch()}
                />
              </div>
            )}
            {alertsQuery.data && alertsQuery.data.length === 0 && (
              <div className="p-4">
                <EmptyState title="No alerts sent yet" description="Broadcasts will appear here." />
              </div>
            )}
            {alertsQuery.data && alertsQuery.data.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sent</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Delivery</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alertsQuery.data.slice(0, 12).map((a) => {
                    const d = a.deliveries ?? [];
                    const delivered = d.filter((x) => x.status !== "FAILED").length;
                    const failed = d.length - delivered;
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs">{formatDateTime(a.createdAt)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              a.severity === "CRITICAL"
                                ? "destructive"
                                : a.severity === "WARNING"
                                  ? "warning"
                                  : "secondary"
                            }
                          >
                            {a.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-xs" title={a.message}>
                          {a.message}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {d.length === 0
                            ? "—"
                            : `${delivered} ok${failed > 0 ? ` · ${failed} failed` : ""}`}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Confirm dialog — send stays disabled until the final text is reviewed */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Confirm broadcast</DialogTitle>
            <DialogDescription>
              This goes to {recipientCount} guest(s) on active trips by SMS
              {severity === "CRITICAL" ? ", plus a Voice call" : ""}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border bg-secondary/40 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Final message
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{english || "(empty)"}</p>
              {swahili && <p className="mt-2 whitespace-pre-wrap text-sm">{swahili}</p>}
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              <span>
                I have read the final message above and confirm it should be sent to{" "}
                <strong>{recipientCount} guests</strong>.
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Back to editing
            </Button>
            <Button
              disabled={!reviewed || !canSend || send.isPending}
              onClick={() =>
                send.mutate({
                  type,
                  severity,
                  message: english,
                  swahiliMessage: swahili || undefined,
                  parkId: parkId ? Number(parkId) : null,
                })
              }
            >
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send to {recipientCount} guests
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CharCount({ len }: { len: number }) {
  const over = len > 160;
  return (
    <span className={`text-xs ${over ? "font-medium text-destructive" : "text-muted-foreground"}`}>
      {len}/160
    </span>
  );
}
