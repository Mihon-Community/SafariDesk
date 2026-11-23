"""Rule-first anomaly detection for payments and bookings (LLM explanation optional)."""

from __future__ import annotations

from collections import Counter

from schemas import Anomaly, AnomalyInput, AnomalyResponse


def _payments(rows: list[dict]) -> list[Anomaly]:
    out: list[Anomaly] = []
    seen_refs: dict[str, int] = {}
    amounts_by_ref: dict[str, float] = {}

    for row in rows:
        rid = row.get("id")
        ref = str(row.get("mpesaRef") or row.get("providerRef") or "")
        amount = float(row.get("amount") or 0)
        due = row.get("depositDue")

        if ref:
            seen_refs[ref] = seen_refs.get(ref, 0) + 1
            if seen_refs[ref] == 2:
                out.append(Anomaly(id=rid, kind="payment", reason=f"Duplicate M-Pesa reference {ref}", severity="WARNING"))
            amounts_by_ref.setdefault(ref, amount)
            if amount != amounts_by_ref.get(ref):
                out.append(Anomaly(id=rid, kind="payment", reason=f"Reference {ref} seen with two different amounts", severity="CRITICAL"))

        if due is not None and amount and float(due) > 0 and abs(amount - float(due)) < 1:
            out.append(Anomaly(id=rid, kind="payment", reason=f"Payment of {amount:g} matches deposit due on a mismatched booking", severity="INFO"))

    # repeat-failure numbers
    failures = Counter(
        str(r.get("phone") or "") for r in rows if str(r.get("status") or "").upper() == "FAILED"
    )
    for phone, count in failures.items():
        if phone and count >= 3:
            out.append(
                Anomaly(id=None, kind="payment", reason=f"{count} failed payments from one number", severity="WARNING")
            )
    return out


def _bookings(rows: list[dict]) -> list[Anomaly]:
    out: list[Anomaly] = []
    dates: Counter = Counter()
    for row in rows:
        rid = row.get("id")
        pax = int(row.get("pax") or 0)
        if pax > 50:
            out.append(Anomaly(id=rid, kind="booking", reason=f"Pax {pax} above the 50-person limit", severity="WARNING"))
        start = str(row.get("startDate") or "")
        if start:
            dates[start] += 1
    for day, count in dates.items():
        if count >= 4:
            out.append(
                Anomaly(id=None, kind="booking", reason=f"{count} trips start on {day}; check fleet capacity", severity="INFO")
            )
    return out


def detect_anomalies(req: AnomalyInput) -> AnomalyResponse:
    if req.kind == "payments":
        return AnomalyResponse(anomalies=_payments(req.rows))
    return AnomalyResponse(anomalies=_bookings(req.rows))
