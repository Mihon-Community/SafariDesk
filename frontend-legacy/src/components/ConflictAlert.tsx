import { AlertTriangle } from "lucide-react";
import type { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { Booking } from "@/lib/types";

/**
 * HTTP 409 assignment conflict. Names the clashing booking when the server
 * sends it, so the operator knows exactly what to move.
 */
export function ConflictAlert({
  error,
  onRetry,
  onClose,
}: {
  error: ApiError | null;
  onRetry?: () => void;
  onClose?: () => void;
}) {
  if (!error || !error.isConflict) return null;
  const clash: Booking | undefined = error.body?.booking;

  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-semibold">Assignment conflict</p>
          <p className="text-amber-800">{error.message}</p>

          {clash && (
            <div className="rounded-md border border-amber-200 bg-card p-3 text-xs">
              <p className="font-semibold text-foreground">Clashing booking #{clash.id}</p>
              <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Guest</dt>
                  <dd>{clash.guest?.name ?? `#${clash.guestId}`}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Trip</dt>
                  <dd>
                    {formatDate(clash.startDate)} – {formatDate(clash.endDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Package</dt>
                  <dd>{clash.packageName ?? `#${clash.packageId}`}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Pax</dt>
                  <dd>{clash.pax}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>{clash.status}</dd>
                </div>
              </dl>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry}>
                Pick different driver
              </Button>
            )}
            {onClose && (
              <Button size="sm" variant="ghost" onClick={onClose}>
                Dismiss
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
