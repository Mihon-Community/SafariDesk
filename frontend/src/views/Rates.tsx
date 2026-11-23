"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PencilLine } from "lucide-react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import type { Driver, ParkFee, RateEntity, Season, Vehicle } from "@/lib/types";
import { RESIDENCIES } from "@/lib/types";
import { formatDate, formatMoney, maskPhone } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState } from "@/components/States";

type EntityKey = "parkFees" | "seasons" | "vehicles" | "drivers";

export default function Rates() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ entity: EntityKey; id: number } | null>(null);

  const ratesQuery = useQuery({
    queryKey: ["rates"],
    queryFn: () => api<RateEntity>("/api/rates"),
  });

  const update = useMutation({
    mutationFn: ({
      entity,
      id,
      body,
    }: {
      entity: string;
      id: number;
      body: Record<string, unknown>;
    }) => api(`/api/rates/${entity}/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      toast.success("Rate updated");
      qc.invalidateQueries({ queryKey: ["rates"] });
      qc.invalidateQueries({ queryKey: ["quote"] });
      setEditing(null);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not save the change"),
  });

  const data = ratesQuery.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rates"
        description="Park fees, seasons, fleet and drivers. Every change is audit-logged on the server."
      />

      {ratesQuery.isLoading && <Skeleton className="h-80 w-full" />}
      {ratesQuery.isError && (
        <ErrorState
          message={ratesQuery.error instanceof Error ? ratesQuery.error.message : "Failed"}
          onRetry={() => ratesQuery.refetch()}
        />
      )}

      {data && (
        <Tabs defaultValue="fees">
          <TabsList>
            <TabsTrigger value="fees">Park fees</TabsTrigger>
            <TabsTrigger value="seasons">Seasons</TabsTrigger>
            <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
            <TabsTrigger value="drivers">Drivers</TabsTrigger>
          </TabsList>

          <TabsContent value="fees">
            <Card>
              <CardContent className="p-0">
                <div className="rtable-wrap">
                  <Table className="rtable">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Park</TableHead>
                      <TableHead>Residency</TableHead>
                      <TableHead className="text-right">Per person / day</TableHead>
                      <TableHead className="text-right">Conservancy / day</TableHead>
                      <TableHead>Effective from</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.parkFees.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell data-label="Park">{f.parkName ?? `#${f.parkId}`}</TableCell>
                        <TableCell data-label="Residency">
                          <Badge variant="outline">{f.residency.replace(/_/g, " ")}</Badge>
                        </TableCell>
                        <TableCell data-label="Per person / day" className="text-right">
                          {formatMoney(f.perPersonPerDay)}
                        </TableCell>
                        <TableCell data-label="Conservancy / day" className="text-right">
                          {formatMoney(f.conservancyPerPersonDay)}
                        </TableCell>
                        <TableCell data-label="Effective from">{formatDate(f.effectiveFrom)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => setEditing({ entity: "parkFees", id: f.id })}>
                            <PencilLine className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="seasons">
            <Card>
              <CardContent className="p-0">
                <div className="rtable-wrap">
                  <Table className="rtable">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead className="text-right">Multiplier</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.seasons.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell data-label="Name" className="font-medium">{s.name}</TableCell>
                        <TableCell data-label="From">{formatDate(s.startDate)}</TableCell>
                        <TableCell data-label="To">{formatDate(s.endDate)}</TableCell>
                        <TableCell data-label="Multiplier" className="text-right">
                          ×{s.multiplier.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => setEditing({ entity: "seasons", id: s.id })}>
                            <PencilLine className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vehicles">
            <Card>
              <CardContent className="p-0">
                <div className="rtable-wrap">
                  <Table className="rtable">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plate</TableHead>
                      <TableHead className="text-right">Capacity</TableHead>
                      <TableHead className="text-right">Day rate</TableHead>
                      <TableHead>Insurance expires</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.vehicles.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell data-label="Plate" className="font-medium">{v.plate}</TableCell>
                        <TableCell data-label="Capacity" className="text-right">{v.capacity}</TableCell>
                        <TableCell data-label="Day rate" className="text-right">{formatMoney(v.dayRate)}</TableCell>
                        <TableCell data-label="Insurance expires">{formatDate(v.insuranceExpiry)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => setEditing({ entity: "vehicles", id: v.id })}>
                            <PencilLine className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="drivers">
            <Card>
              <CardContent className="p-0">
                <div className="rtable-wrap">
                  <Table className="rtable">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="text-right">Day rate</TableHead>
                      <TableHead>Certificate expires</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.drivers.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell data-label="Name" className="font-medium">{d.name}</TableCell>
                        <TableCell data-label="Phone">{maskPhone(d.phone)}</TableCell>
                        <TableCell data-label="Day rate" className="text-right">{formatMoney(d.dayRate)}</TableCell>
                        <TableCell data-label="Certificate expires">{formatDate(d.certExpiry)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => setEditing({ entity: "drivers", id: d.id })}>
                            <PencilLine className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <EditDialog
        editing={editing}
        data={data}
        saving={update.isPending}
        onClose={() => setEditing(null)}
        onSave={(entity, id, body) => update.mutate({ entity, id, body })}
      />
    </div>
  );
}

function EditDialog({
  editing,
  data,
  saving,
  onClose,
  onSave,
}: {
  editing: { entity: EntityKey; id: number } | null;
  data: RateEntity | undefined;
  saving: boolean;
  onClose: () => void;
  onSave: (entity: string, id: number, body: Record<string, unknown>) => void;
}) {
  if (!editing || !data) return null;

  let title = "";
  let fields: React.ReactNode = null;

  if (editing.entity === "parkFees") {
    const fee = data.parkFees.find((f) => f.id === editing.id);
    if (!fee) return null;
    title = `Edit park fee — ${fee.parkName ?? `#${fee.parkId}`}`;
    fields = (
      <>
        <Field label="Residency">
          <select
            name="residency"
            defaultValue={fee.residency}
            className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {RESIDENCIES.map((r) => (
              <option key={r} value={r}>
                {r.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Per person per day (KES)">
          <Input name="perPersonPerDay" type="number" min={0} defaultValue={fee.perPersonPerDay} required />
        </Field>
        <Field label="Conservancy per person per day (KES)">
          <Input
            name="conservancyPerPersonDay"
            type="number"
            min={0}
            defaultValue={fee.conservancyPerPersonDay}
            required
          />
        </Field>
      </>
    );
  }

  if (editing.entity === "seasons") {
    const season = data.seasons.find((s) => s.id === editing.id);
    if (!season) return null;
    title = `Edit season — ${season.name}`;
    fields = (
      <>
        <Field label="Name">
          <Input name="name" defaultValue={season.name} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <Input name="startDate" type="date" defaultValue={season.startDate.slice(0, 10)} required />
          </Field>
          <Field label="End date">
            <Input name="endDate" type="date" defaultValue={season.endDate.slice(0, 10)} required />
          </Field>
        </div>
        <Field label="Multiplier (e.g. 1.20)">
          <Input name="multiplier" type="number" step="0.01" min={0.1} defaultValue={season.multiplier} required />
        </Field>
      </>
    );
  }

  if (editing.entity === "vehicles") {
    const vehicle = data.vehicles.find((v) => v.id === editing.id);
    if (!vehicle) return null;
    title = `Edit vehicle — ${vehicle.plate}`;
    fields = (
      <>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Capacity">
            <Input name="capacity" type="number" min={1} defaultValue={vehicle.capacity} required />
          </Field>
          <Field label="Day rate (KES)">
            <Input name="dayRate" type="number" min={0} defaultValue={vehicle.dayRate} required />
          </Field>
        </div>
        <Field label="Insurance expiry">
          <Input name="insuranceExpiry" type="date" defaultValue={vehicle.insuranceExpiry?.slice(0, 10)} />
        </Field>
      </>
    );
  }

  if (editing.entity === "drivers") {
    const driver = data.drivers.find((d) => d.id === editing.id);
    if (!driver) return null;
    title = `Edit driver — ${driver.name}`;
    fields = (
      <>
        <Field label="Day rate (KES)">
          <Input name="dayRate" type="number" min={0} defaultValue={driver.dayRate} required />
        </Field>
        <Field label="Certificate expiry">
          <Input name="certExpiry" type="date" defaultValue={driver.certExpiry?.slice(0, 10)} />
        </Field>
      </>
    );
  }

  return (
    <Dialog open={!!editing} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>The change is written to the audit log.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const body: Record<string, unknown> = {};
            for (const [k, v] of fd.entries()) {
              body[k] =
                k === "perPersonPerDay" ||
                k === "conservancyPerPersonDay" ||
                k === "capacity" ||
                k === "dayRate"
                  ? Number(v)
                  : k === "multiplier"
                    ? Number(v)
                    : v;
            }
            onSave(editing.entity, editing.id, body);
          }}
          className="space-y-3"
        >
          {fields}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save change
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
