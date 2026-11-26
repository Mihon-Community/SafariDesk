"""PostgreSQL-backed SafariDesk business API.

The browser-facing JSON contract mirrors the former API, but this router has no
demo rows: lists and aggregates are derived only from submitted database rows.
"""

from __future__ import annotations

import asyncio
import json
import math
import re
import uuid
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from inspect import isawaitable
from typing import Any, Callable, Mapping

from fastapi import APIRouter, Body, Depends, Query
from fastapi.responses import JSONResponse
from psycopg_pool import ConnectionPool

from .auth import ApiError
from .telecom import normalize_kenyan_phone


BOOKING_STATUSES = {"PENDING", "DEPOSIT_PAID", "CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED"}
RESIDENCIES = {"citizen", "resident", "non_resident"}
ASSIGNMENT_STATUSES = {"WAITING", "ACCEPTED", "DECLINED", "CANCELLED", "COMPLETED"}
PAYMENT_STATUSES = {"PENDING", "SUCCESS", "FAILED", "MANUAL"}
ALERT_SEVERITIES = {"INFO", "WARNING", "CRITICAL"}
RATE_TYPES = {
    "parks": ("parks", {"name", "emergencyContact"}),
    "packages": ("packages", {"name", "shortLabel", "parkId", "days", "marginPct", "active"}),
    "parkFees": ("park_fees", {"parkId", "residency", "perPersonPerDay", "conservancyPerPersonDay", "effectiveFrom"}),
    "seasons": ("seasons", {"name", "startDate", "endDate", "multiplier"}),
    "drivers": ("drivers", {"name", "phone", "dayRate", "certExpiry", "active"}),
    "vehicles": ("vehicles", {"plate", "capacity", "dayRate", "insuranceExpiry", "active"}),
}


class DomainError(ApiError):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(status, code, message)


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": message, "code": code})


def _row_value(row: Any, name: str, index: int) -> Any:
    if row is None:
        return None
    if isinstance(row, Mapping):
        return row.get(name)
    try:
        return row[name]
    except (TypeError, KeyError, IndexError):
        try:
            return row[index]
        except (TypeError, KeyError, IndexError):
            return None


def _record(row: Any) -> dict[str, Any] | None:
    if row is None:
        return None
    if isinstance(row, Mapping):
        record_id = row.get("id")
        payload = row.get("payload")
        created_at = row.get("created_at", row.get("createdAt"))
        return _public_record(record_id, payload, created_at)
    return _public_record(row[0], row[1], row[2])


def _public_record(record_id: Any, payload: Any, created_at: Any) -> dict[str, Any]:
    if isinstance(payload, str):
        payload = json.loads(payload)
    result = dict(payload or {})
    result["id"] = int(record_id)
    if created_at is not None:
        result["createdAt"] = _iso(created_at)
    return result


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _all(pool: ConnectionPool, record_type: str) -> list[dict[str, Any]]:
    with pool.connection() as conn:
        cursor = conn.execute(
            "SELECT id, payload, created_at FROM business_records WHERE record_type = %s ORDER BY id",
            (record_type,),
        )
        return [item for row in cursor.fetchall() if (item := _record(row)) is not None]


def _get(pool: ConnectionPool, record_type: str, record_id: int) -> dict[str, Any] | None:
    with pool.connection() as conn:
        cursor = conn.execute(
            "SELECT id, payload, created_at FROM business_records WHERE record_type = %s AND id = %s",
            (record_type, record_id),
        )
        return _record(cursor.fetchone())


def _insert(pool: ConnectionPool, record_type: str, payload: Mapping[str, Any]) -> dict[str, Any]:
    with pool.connection() as conn:
        cursor = conn.execute(
            "INSERT INTO business_records (record_type, payload) VALUES (%s, %s::jsonb) RETURNING id, payload, created_at",
            (record_type, json.dumps(dict(payload), separators=(",", ":"))),
        )
        item = _record(cursor.fetchone())
    if item is None:
        raise RuntimeError("PostgreSQL did not return the inserted record")
    return item


def _update(pool: ConnectionPool, record_type: str, record_id: int, payload: Mapping[str, Any]) -> dict[str, Any] | None:
    with pool.connection() as conn:
        cursor = conn.execute(
            "UPDATE business_records SET payload = %s::jsonb, updated_at = now() WHERE record_type = %s AND id = %s RETURNING id, payload, created_at",
            (json.dumps(dict(payload), separators=(",", ":")), record_type, record_id),
        )
        return _record(cursor.fetchone())


def _body(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise DomainError(400, "VALIDATION", "A JSON object is required.")
    return value


def _text(body: Mapping[str, Any], key: str, *, required: bool = True, max_length: int = 500, strip: bool = True) -> str | None:
    value = body.get(key)
    if value is None and not required:
        return None
    if not isinstance(value, str):
        raise DomainError(400, "VALIDATION", f"{key} is required.")
    result = value.strip() if strip else value
    if (required and not result) or len(result) > max_length:
        raise DomainError(400, "VALIDATION", f"{key} is invalid.")
    return result


def _integer(body: Mapping[str, Any], key: str, *, minimum: int = 0, maximum: int = 2_000_000_000) -> int:
    value = body.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum or value > maximum:
        raise DomainError(400, "VALIDATION", f"{key} is invalid.")
    return value


def _number(body: Mapping[str, Any], key: str, *, minimum: float = 0, maximum: float = 1_000_000) -> float:
    value = body.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        raise DomainError(400, "VALIDATION", f"{key} is invalid.")
    result = float(value)
    if result < minimum or result > maximum:
        raise DomainError(400, "VALIDATION", f"{key} is invalid.")
    return result


def _date(value: Any, field: str) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            pass
    raise DomainError(400, "VALIDATION", f"{field} must be an ISO date.")


def _date_text(value: Any, field: str) -> str:
    return _date(value, field).isoformat()


def _int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError, OverflowError):
        return fallback


def _num(value: Any, fallback: float = 0.0) -> float:
    try:
        result = float(value)
        return result if math.isfinite(result) else fallback
    except (TypeError, ValueError, OverflowError):
        return fallback


def _find(items: list[dict[str, Any]], record_id: Any) -> dict[str, Any] | None:
    wanted = _int(record_id, -1)
    return next((item for item in items if item["id"] == wanted), None)


def _guest_for_booking(pool: ConnectionPool, booking: Mapping[str, Any]) -> dict[str, Any] | None:
    return _get(pool, "guests", _int(booking.get("guestId"), -1))


def _serialize_booking(pool: ConnectionPool, booking: dict[str, Any]) -> dict[str, Any]:
    result = dict(booking)
    guest = _guest_for_booking(pool, booking)
    package = _get(pool, "packages", _int(booking.get("packageId"), -1))
    park = _get(pool, "parks", _int(booking.get("parkId"), -1))
    result["guest"] = guest
    result["packageName"] = package.get("name") if package else None
    result["parkName"] = park.get("name") if park else None
    return result


def _serialize_assignment(pool: ConnectionPool, assignment: dict[str, Any]) -> dict[str, Any]:
    result = dict(assignment)
    driver = _get(pool, "drivers", _int(assignment.get("driverId"), -1))
    vehicle_id = assignment.get("vehicleId")
    vehicle = _get(pool, "vehicles", _int(vehicle_id, -1)) if vehicle_id is not None else None
    booking = _get(pool, "bookings", _int(assignment.get("bookingId"), -1))
    result["driver"] = driver
    result["vehicle"] = vehicle
    result["booking"] = _serialize_booking(pool, booking) if booking else None
    return result


def _serialize_fleet(pool: ConnectionPool, item: dict[str, Any], kind: str) -> dict[str, Any]:
    result = dict(item)
    field = "driverId" if kind == "drivers" else "vehicleId"
    result["assignments"] = [
        _serialize_assignment(pool, assignment)
        for assignment in _all(pool, "assignments")
        if _int(assignment.get(field), -1) == item["id"]
    ]
    return result


def _quote(pool: ConnectionPool, package_id: int, pax: int, residency: str, start: date, deposit_pct: float) -> dict[str, Any]:
    package = _get(pool, "packages", package_id)
    if not package or package.get("active", True) is not True:
        raise DomainError(400, "QUOTE", "Could not compute quote for that package.")
    park_id = _int(package.get("parkId"), -1)
    days = _int(package.get("days"), 0)
    if days < 1:
        raise DomainError(400, "QUOTE", "Package duration is invalid.")
    fees = [
        item for item in _all(pool, "park_fees")
        if _int(item.get("parkId"), -1) == park_id
        and item.get("residency") == residency
        and _date(item.get("effectiveFrom"), "effectiveFrom") <= start
    ]
    fees.sort(key=lambda item: item.get("effectiveFrom", ""), reverse=True)
    fee = fees[0] if fees else {}
    seasons = [
        item for item in _all(pool, "seasons")
        if _date(item.get("startDate"), "startDate") <= start <= _date(item.get("endDate"), "endDate")
    ]
    multiplier = _num(seasons[0].get("multiplier"), 1.0) if seasons else 1.0
    drivers = [item for item in _all(pool, "drivers") if item.get("active") is True]
    vehicles = [item for item in _all(pool, "vehicles") if item.get("active") is True]
    driver_rate = _num(drivers[0].get("dayRate")) if drivers else 0
    vehicle_rate = _num(vehicles[0].get("dayRate")) if vehicles else 0
    park_fees = _num(fee.get("perPersonPerDay")) * pax * days
    conservancy = _num(fee.get("conservancyPerPersonDay")) * pax * days
    transport = (driver_rate + vehicle_rate) * days
    base = park_fees + conservancy + transport
    seasonal = round(base * multiplier)
    margin = round(seasonal * _num(package.get("marginPct")) / 100)
    total = int(seasonal + margin)
    return {
        "total": total,
        "depositDue": int(round(total * deposit_pct / 100)),
        "breakdown": {
            "parkFees": int(round(park_fees)),
            "conservancy": int(round(conservancy)),
            "transport": int(round(transport)),
            "seasonAdjustment": int(round(seasonal - base)),
            "margin": int(margin),
        },
    }


def _monthly_key(value: Any) -> str | None:
    if value is None:
        return None
    text = _iso(value) or ""
    return text[:7] if re.match(r"^\d{4}-\d{2}", text) else None


def _current_months(count: int = 6) -> list[str]:
    today = date.today()
    result = []
    year, month = today.year, today.month
    for _ in range(count):
        result.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            year -= 1
            month = 12
    return list(reversed(result))


def _summary(pool: ConnectionPool) -> dict[str, Any]:
    bookings = _all(pool, "bookings")
    payments = _all(pool, "payments")
    assignments = _all(pool, "assignments")
    guests = _all(pool, "guests")
    packages = _all(pool, "packages")
    by_status = dict(Counter(str(item.get("status")) for item in bookings if item.get("status")))
    revenue = sum(_int(item.get("amount")) for item in payments if item.get("status") in {"SUCCESS", "MANUAL"})
    deposits = sum(_int(item.get("depositDue")) for item in bookings if item.get("status") == "PENDING")
    today = date.today()
    departing = []
    for booking in bookings:
        if booking.get("status") not in {"DEPOSIT_PAID", "CONFIRMED"}:
            continue
        try:
            start = _date(booking.get("startDate"), "startDate")
        except DomainError:
            continue
        if today <= start <= today + timedelta(days=7):
            guest = _find(guests, booking.get("guestId"))
            package = _find(packages, booking.get("packageId"))
            departing.append({
                "id": booking["id"], "guestName": guest.get("name", "") if guest else "",
                "packageName": package.get("name", "") if package else "",
                "startDate": _date_text(start, "startDate"), "pax": _int(booking.get("pax")),
                "status": booking.get("status"),
            })
    allocated = {
        _int(item.get("bookingId"), -1) for item in assignments
        if item.get("status") in {"WAITING", "ACCEPTED"}
    }
    unallocated = sum(
        1 for item in bookings
        if item.get("status") in {"DEPOSIT_PAID", "CONFIRMED"} and item["id"] not in allocated
    )
    months = _current_months(6)
    monthly_map = {key: {"month": key, "bookings": 0, "revenue": 0} for key in months}
    for booking in bookings:
        key = _monthly_key(booking.get("createdAt"))
        if key in monthly_map:
            monthly_map[key]["bookings"] += 1
    for payment in payments:
        if payment.get("status") not in {"SUCCESS", "MANUAL"}:
            continue
        key = _monthly_key(payment.get("createdAt"))
        if key in monthly_map:
            monthly_map[key]["revenue"] += _int(payment.get("amount"))
    active_guests = {item.get("guestId") for item in bookings if item.get("status") == "ACTIVE"}
    return {
        "byStatus": by_status, "revenuePaid": revenue, "depositsDue": deposits,
        "departing7Days": departing, "unallocated": unallocated,
        "monthly": list(monthly_map.values()), "activeGuests": len(active_guests),
    }


def _daily_series(pool: ConnectionPool, days: int = 90) -> list[dict[str, Any]]:
    today = date.today()
    bookings = _all(pool, "bookings")
    payments = _all(pool, "payments")
    out = []
    for offset in range(days - 1, -1, -1):
        day = today - timedelta(days=offset)
        prior = day - timedelta(days=365)
        booking_count = 0
        prior_count = 0
        revenue = 0
        prior_revenue = 0
        for booking in bookings:
            try:
                start = _date(booking.get("startDate"), "startDate")
            except DomainError:
                continue
            if start == day:
                booking_count += 1
            elif start == prior:
                prior_count += 1
        for payment in payments:
            if payment.get("status") not in {"SUCCESS", "MANUAL"}:
                continue
            created = str(payment.get("createdAt", ""))[:10]
            if created == day.isoformat():
                revenue += _int(payment.get("amount"))
            elif created == prior.isoformat():
                prior_revenue += _int(payment.get("amount"))
        out.append({"date": day.isoformat(), "bookings": booking_count, "revenue": revenue,
                    "prevBookings": prior_count, "prevRevenue": prior_revenue})
    return out


def _serialize_alert(pool: ConnectionPool, alert: dict[str, Any]) -> dict[str, Any]:
    result = dict(alert)
    park = _get(pool, "parks", _int(alert.get("parkId"), -1)) if alert.get("parkId") is not None else None
    result["parkName"] = park.get("name") if park else None
    result["deliveries"] = []
    for delivery in _all(pool, "deliveries"):
        if _int(delivery.get("alertId"), -1) != alert["id"]:
            continue
        row = dict(delivery)
        guest = _get(pool, "guests", _int(delivery.get("guestId"), -1))
        row["guestName"] = guest.get("name") if guest else None
        result["deliveries"].append(row)
    return result


def _as_sms_result(value: Any) -> dict[str, Any]:
    if isinstance(value, Mapping):
        return dict(value)
    return {"accepted": False, "reason": "delivery_not_configured"}


def _send_sms(sms_sender: Callable[..., Any] | None, pool: ConnectionPool, settings: Any,
              phone: str, message: str, event_kind: str) -> dict[str, Any]:
    if sms_sender is None:
        return {"accepted": False, "reason": "delivery_not_configured"}
    try:
        outcome = sms_sender(phone, message, event_kind)
        if isawaitable(outcome):
            outcome = asyncio.run(outcome)
        return _as_sms_result(outcome)
    except Exception:
        return {"accepted": False, "reason": "provider_error"}


def _parse_id(value: str) -> int:
    try:
        result = int(value)
        if result > 0:
            return result
    except (TypeError, ValueError):
        pass
    raise DomainError(404, "NOT_FOUND", "Record not found.")


def _user_id(user: Mapping[str, Any]) -> Any:
    return user.get("id") if isinstance(user, Mapping) else None


def build_domain_router(
    pool: ConnectionPool,
    settings: Any,
    auth_dependency: Callable[..., Any],
    permission_dependency_factory: Callable[[str], Callable[..., Any]],
    sms_sender: Callable[..., Any] | None,
) -> APIRouter:
    """Build the authenticated business routes backed by ``business_records``."""
    router = APIRouter(prefix="/api")

    def permission(name: str) -> list[Any]:
        return [Depends(permission_dependency_factory(name))]

    @router.get("/bookings", dependencies=permission("bookings:read"))
    def list_bookings(
        status: str | None = Query(default=None), q: str | None = Query(default=None),
        actor: dict[str, Any] = Depends(auth_dependency),
    ) -> Any:
        del actor
        rows = [_serialize_booking(pool, item) for item in _all(pool, "bookings")]
        if status:
            rows = [item for item in rows if item.get("status") == status]
        if q:
            query = q.casefold()
            rows = [item for item in rows if any(
                query in str(value).casefold()
                for value in (item.get("guest", {}).get("name") if item.get("guest") else None,
                              item.get("guest", {}).get("phone") if item.get("guest") else None,
                              item.get("packageName")) if value
            )]
        return rows

    @router.post("/bookings", status_code=201, dependencies=permission("bookings:write"))
    def create_booking(body: Any = Body(default=None), actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        data = _body(body)
        name = _text(data, "guestName", max_length=80)
        raw_phone = _text(data, "phone", max_length=24)
        phone = normalize_kenyan_phone(raw_phone)
        if not phone:
            raise DomainError(400, "INVALID_PHONE", "Enter a valid Kenyan mobile number.")
        package_id = _integer(data, "packageId", minimum=1)
        pax = _integer(data, "pax", minimum=1, maximum=100)
        residency = data.get("residency")
        if residency not in RESIDENCIES:
            raise DomainError(400, "VALIDATION", "Residency is invalid.")
        start = _date(data.get("startDate"), "startDate")
        deposit_pct = _number(data, "depositPct", minimum=0, maximum=100) if "depositPct" in data else 30
        with pool.connection() as conn:
            guest_cursor = conn.execute(
                "SELECT id, payload, created_at FROM business_records WHERE record_type = %s ORDER BY id",
                ("guests",),
            )
            guests = [_record(row) for row in guest_cursor.fetchall()]
            guest = next((item for item in guests if item and item.get("phone") == phone), None)
        if guest is None:
            guest = _insert(pool, "guests", {
                "name": name, "phone": phone, "residency": residency,
                "loyaltyPoints": 0, "referralCode": None,
            })
        quote = _quote(pool, package_id, pax, residency, start, deposit_pct)
        package = _get(pool, "packages", package_id)
        assert package is not None
        days = _int(package.get("days"))
        if days < 1:
            raise DomainError(400, "VALIDATION", "Package duration is invalid.")
        record = _insert(pool, "bookings", {
            "guestId": guest["id"], "packageId": package_id,
            "parkId": _int(package.get("parkId")), "startDate": start.isoformat(),
            "endDate": (start + timedelta(days=days - 1)).isoformat(),
            "pax": pax, "total": quote["total"], "depositDue": quote["depositDue"],
            "quoteBreakdown": quote["breakdown"], "status": "PENDING", "source": "web",
            "createdBy": _user_id(actor),
        })
        return _serialize_booking(pool, record)

    @router.get("/bookings/{record_id}", dependencies=permission("bookings:read"))
    def get_booking(record_id: str, actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        booking = _get(pool, "bookings", _parse_id(record_id))
        if not booking:
            return _error(404, "NOT_FOUND", "Booking not found.")
        payments = [item for item in _all(pool, "payments") if _int(item.get("bookingId"), -1) == booking["id"]]
        assignment = next((item for item in _all(pool, "assignments") if _int(item.get("bookingId"), -1) == booking["id"]), None)
        if assignment:
            assignment = _serialize_assignment(pool, assignment)
        return {
            **_serialize_booking(pool, booking), "payments": payments, "assignment": assignment,
            "messages": [],
        }

    @router.patch("/bookings/{record_id}", dependencies=permission("bookings:write"))
    def update_booking(record_id: str, body: Any = Body(default=None), actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        booking = _get(pool, "bookings", _parse_id(record_id))
        if not booking:
            return _error(404, "NOT_FOUND", "Booking not found.")
        data = _body(body)
        if set(data) - {"status"} or data.get("status") not in BOOKING_STATUSES:
            raise DomainError(400, "VALIDATION", "Booking status is invalid.")
        updated = _update(pool, "bookings", booking["id"], {**booking_without_meta(booking), "status": data["status"]})
        assert updated is not None
        return _serialize_booking(pool, updated)

    @router.post("/bookings/{record_id}/pay", dependencies=permission("payments:mark"))
    def create_payment(record_id: str, actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        booking = _get(pool, "bookings", _parse_id(record_id))
        if not booking:
            return _error(404, "NOT_FOUND", "Booking not found.")
        guest = _guest_for_booking(pool, booking)
        reference = f"SD-{booking['id']}-{uuid.uuid4().hex[:12].upper()}"
        _insert(pool, "payments", {
            "bookingId": booking["id"], "phone": guest.get("phone", "") if guest else "",
            "providerRef": reference, "mpesaRef": None, "amount": _int(booking.get("depositDue")),
            "status": "PENDING", "createdBy": _user_id(actor),
        })
        return {"ok": True, "reference": reference}

    @router.post("/bookings/{record_id}/mark-paid", dependencies=permission("payments:mark"))
    def mark_paid(record_id: str, body: Any = Body(default=None), actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        booking = _get(pool, "bookings", _parse_id(record_id))
        if not booking:
            return _error(404, "NOT_FOUND", "Booking not found.")
        data = _body(body)
        reference = _text(data, "reference", max_length=120)
        guest = _guest_for_booking(pool, booking)
        _insert(pool, "payments", {
            "bookingId": booking["id"], "phone": guest.get("phone", "") if guest else "",
            "providerRef": None, "mpesaRef": reference, "amount": _int(booking.get("depositDue")),
            "status": "MANUAL", "createdBy": _user_id(actor),
        })
        updated = _update(pool, "bookings", booking["id"], {
            **booking_without_meta(booking), "status": "DEPOSIT_PAID",
        })
        assert updated is not None
        return _serialize_booking(pool, updated)

    @router.post("/bookings/{record_id}/assign", status_code=201, dependencies=permission("dispatch:write"))
    def assign_booking(record_id: str, body: Any = Body(default=None), actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        data = _body(body)
        booking = _get(pool, "bookings", _parse_id(record_id))
        if not booking:
            return _error(404, "NOT_FOUND", "Booking not found.")
        driver_id = _integer(data, "driverId", minimum=1)
        vehicle_id = _integer(data, "vehicleId", minimum=1)
        driver = _get(pool, "drivers", driver_id)
        vehicle = _get(pool, "vehicles", vehicle_id)
        if not driver or not vehicle or driver.get("active") is False or vehicle.get("active") is False:
            return _error(400, "INVALID_ASSIGNMENT", "Choose an active driver and vehicle.")
        start = _date(booking.get("startDate"), "startDate")
        end = _date(booking.get("endDate"), "endDate")
        clash = None
        for assignment in _all(pool, "assignments"):
            if assignment.get("status") not in {"WAITING", "ACCEPTED"}:
                continue
            if _int(assignment.get("driverId"), -1) != driver_id and _int(assignment.get("vehicleId"), -1) != vehicle_id:
                continue
            try:
                other_start = _date(assignment.get("tripStart"), "tripStart")
                other_end = _date(assignment.get("tripEnd"), "tripEnd")
            except DomainError:
                continue
            if other_start <= end and other_end >= start:
                clash = _get(pool, "bookings", _int(assignment.get("bookingId"), -1))
                break
        if clash:
            return JSONResponse(status_code=409, content={
                "error": "Driver or vehicle already booked on these dates.", "code": "CONFLICT",
                "booking": _serialize_booking(pool, clash),
            })
        assignment = _insert(pool, "assignments", {
            "bookingId": booking["id"], "driverId": driver_id, "vehicleId": vehicle_id,
            "status": "WAITING", "tripStart": start.isoformat(), "tripEnd": end.isoformat(),
            "smsSentAt": None, "respondedAt": None, "createdBy": _user_id(actor),
        })
        sms = _send_sms(
            sms_sender, pool, settings, str(driver.get("phone", "")),
            f"SafariDesk: trip assignment for booking {booking['id']} from {start.isoformat()} to {end.isoformat()}. Reply ACCEPT or DECLINE.",
            "assignment",
        )
        if sms.get("accepted"):
            assignment["smsSentAt"] = _now()
            assignment = _update(pool, "assignments", assignment["id"], booking_without_meta(assignment)) or assignment
        return {"id": assignment["id"], "status": assignment["status"]}

    @router.post("/assignments/{record_id}/resend", dependencies=permission("dispatch:write"))
    def resend_assignment(record_id: str, actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        assignment = _get(pool, "assignments", _parse_id(record_id))
        if not assignment:
            return _error(404, "NOT_FOUND", "Assignment not found.")
        driver = _get(pool, "drivers", _int(assignment.get("driverId"), -1))
        sms = _send_sms(
            sms_sender, pool, settings, str((driver or {}).get("phone", "")),
            f"SafariDesk: trip assignment for booking {assignment.get('bookingId')} from {assignment.get('tripStart')} to {assignment.get('tripEnd')}. Reply ACCEPT or DECLINE.",
            "assignment",
        )
        if sms.get("accepted"):
            assignment["smsSentAt"] = _now()
            _update(pool, "assignments", assignment["id"], booking_without_meta(assignment))
        return {"ok": True, "assignmentId": assignment["id"], "sms": sms}

    @router.post("/quotes", dependencies=permission("concierge:use"))
    def quote(body: Any = Body(default=None), actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        data = _body(body)
        package_id = _integer(data, "packageId", minimum=1)
        pax = _integer(data, "pax", minimum=1, maximum=100)
        residency = data.get("residency")
        if residency not in RESIDENCIES:
            raise DomainError(400, "VALIDATION", "Residency is invalid.")
        start = _date(data.get("start"), "start")
        deposit = _number(data, "depositPct", minimum=0, maximum=100) if "depositPct" in data else 30
        return _quote(pool, package_id, pax, residency, start, deposit)

    @router.get("/drivers", dependencies=permission("drivers:read"))
    def list_drivers(actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        return [_serialize_fleet(pool, item, "drivers") for item in _all(pool, "drivers")]

    @router.get("/vehicles", dependencies=permission("vehicles:read"))
    def list_vehicles(actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        return [_serialize_fleet(pool, item, "vehicles") for item in _all(pool, "vehicles")]

    @router.get("/payments/reconciliation", dependencies=permission("payments:read"))
    def payment_reconciliation(actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        bookings = {item["id"]: item for item in _all(pool, "bookings")}
        guests = {item["id"]: item for item in _all(pool, "guests")}
        payments = _all(pool, "payments")
        rows: list[dict[str, Any]] = []
        for payment in payments:
            booking_id = payment.get("bookingId")
            booking = bookings.get(_int(booking_id, -1)) if booking_id is not None else None
            guest = guests.get(_int(booking.get("guestId"), -1)) if booking else None
            rows.append({
                "id": payment["id"], "bookingId": booking_id, "phone": payment.get("phone", ""),
                "mpesaRef": payment.get("mpesaRef"), "providerRef": payment.get("providerRef"),
                "amount": _int(payment.get("amount")), "status": payment.get("status"),
                "depositDue": _int(booking.get("depositDue")) if booking else None,
                "guestName": guest.get("name") if guest else None,
                "createdAt": payment.get("createdAt"),
            })
        matched = [row for row in rows if row["status"] in {"SUCCESS", "MANUAL"} and row["bookingId"] is not None and row["amount"] == row["depositDue"]]
        mismatched = [row for row in rows if row["status"] in {"SUCCESS", "MANUAL"} and row["bookingId"] is not None and row["amount"] != row["depositDue"]]
        unmatched = [row for row in rows if row["status"] in {"SUCCESS", "MANUAL"} and row["bookingId"] is None]
        paid_bookings = [
            item for item in bookings.values() if item.get("status") in {"DEPOSIT_PAID", "CONFIRMED"}
            and not any(row["bookingId"] == item["id"] and row["status"] in {"SUCCESS", "MANUAL"} for row in rows)
        ]
        for booking in paid_bookings:
            guest = guests.get(_int(booking.get("guestId"), -1))
            unmatched.append({
                "id": 0, "bookingId": booking["id"], "phone": guest.get("phone", "") if guest else "",
                "mpesaRef": None, "providerRef": None, "amount": 0, "status": "MISSING",
                "depositDue": _int(booking.get("depositDue")), "guestName": guest.get("name") if guest else None,
                "createdAt": booking.get("createdAt"),
            })
        return {"matched": matched, "mismatched": mismatched, "unmatched": unmatched}

    @router.get("/payments", dependencies=permission("payments:read"))
    def list_payments(actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        return [{**item, "guestPhone": item.get("phone", "")} for item in _all(pool, "payments")]

    @router.get("/rates", dependencies=permission("rates:read"))
    def get_rates(actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        parks = _all(pool, "parks")
        park_by_id = {item["id"]: item for item in parks}
        fees = []
        for fee in _all(pool, "park_fees"):
            row = dict(fee)
            park = park_by_id.get(_int(fee.get("parkId"), -1))
            row["parkName"] = park.get("name") if park else None
            fees.append(row)
        return {
            "parks": parks, "packages": _all(pool, "packages"), "parkFees": fees,
            "seasons": _all(pool, "seasons"),
            "vehicles": [_serialize_fleet(pool, item, "vehicles") for item in _all(pool, "vehicles")],
            "drivers": [_serialize_fleet(pool, item, "drivers") for item in _all(pool, "drivers")],
        }

    @router.get("/rates/parks", dependencies=permission("rates:read"))
    def list_parks(actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        return _all(pool, "parks")

    @router.get("/rates/packages", dependencies=permission("rates:read"))
    def list_packages(actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        return _all(pool, "packages")

    @router.post("/rates/{entity}", status_code=201, dependencies=permission("rates:write"))
    def create_rate(entity: str, body: Any = Body(default=None), actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        data = _body(body)
        spec = RATE_TYPES.get(entity)
        if spec is None:
            return _error(404, "NOT_FOUND", "Unknown rate entity.")
        record_type, allowed = spec
        unknown = set(data) - allowed
        if unknown:
            raise DomainError(400, "VALIDATION", "Unknown rate fields.")
        payload = _validate_rate(entity, data, allowed, partial=False)
        if entity == "packages" and not _get(pool, "parks", payload["parkId"]):
            raise DomainError(400, "VALIDATION", "Choose an existing park.")
        if entity == "parkFees" and not _get(pool, "parks", payload["parkId"]):
            raise DomainError(400, "VALIDATION", "Choose an existing park.")
        return _insert(pool, record_type, payload)

    @router.patch("/rates/{entity}/{record_id}", dependencies=permission("rates:write"))
    def update_rate(entity: str, record_id: str, body: Any = Body(default=None), actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        data = _body(body)
        spec = RATE_TYPES.get(entity)
        if spec is None:
            return _error(404, "NOT_FOUND", "Unknown rate entity.")
        record_type, allowed = spec
        if set(data) - allowed:
            raise DomainError(400, "VALIDATION", "Unknown rate fields.")
        item_id = _parse_id(record_id)
        old = _get(pool, record_type, item_id)
        if not old:
            return _error(404, "NOT_FOUND", "Rate entity not found.")
        updated_payload = {**booking_without_meta(old), **_validate_rate(entity, data, allowed, partial=True)}
        if entity in {"packages", "parkFees"} and not _get(pool, "parks", _int(updated_payload.get("parkId"), -1)):
            raise DomainError(400, "VALIDATION", "Choose an existing park.")
        return _update(pool, record_type, item_id, updated_payload)

    @router.post("/alerts", status_code=201, dependencies=permission("alerts:write"))
    def create_alert(body: Any = Body(default=None), actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        data = _body(body)
        message = _text(data, "message", max_length=480)
        alert_type = _text(data, "type", required=False, max_length=80) or "Safety"
        severity = data.get("severity") or "INFO"
        if severity not in ALERT_SEVERITIES:
            raise DomainError(400, "VALIDATION", "Alert severity is invalid.")
        park_id = data.get("parkId")
        if park_id is not None:
            if isinstance(park_id, bool) or not isinstance(park_id, int) or not _get(pool, "parks", park_id):
                raise DomainError(400, "VALIDATION", "Choose an existing park.")
        alert = _insert(pool, "alerts", {
            "type": alert_type, "severity": severity, "message": message,
            "swahiliMessage": _text(data, "swahiliMessage", required=False, max_length=480),
            "parkId": park_id, "createdBy": _user_id(actor),
        })
        guests = {item["id"]: item for item in _all(pool, "guests")}
        bookings = _all(pool, "bookings")
        target_ids = {
            _int(item.get("guestId"), -1) for item in bookings
            if item.get("status") == "ACTIVE" and _int(item.get("guestId"), -1) in guests
            and (park_id is None or _int(item.get("parkId"), -1) == park_id)
        }
        for guest_id in sorted(target_ids):
            guest = guests[guest_id]
            if not guest.get("phone"):
                continue
            sms_body = alert.get("swahiliMessage") or alert["message"]
            sms = _send_sms(sms_sender, pool, settings, guest["phone"], sms_body, "safety_alert")
            _insert(pool, "deliveries", {
                "alertId": alert["id"], "guestId": guest_id, "channel": "sms",
                "status": "SENT" if sms.get("accepted") else "FAILED",
                "failureReason": None if sms.get("accepted") else sms.get("reason", "provider_error"),
            })
        return _serialize_alert(pool, alert)

    @router.get("/alerts", dependencies=permission("alerts:read"))
    def list_alerts(actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        return [_serialize_alert(pool, item) for item in reversed(_all(pool, "alerts"))]

    @router.get("/feedback", dependencies=permission("feedback:read"))
    def list_feedback(actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        guests = {item["id"]: item for item in _all(pool, "guests")}
        packages = {item["id"]: item for item in _all(pool, "packages")}
        bookings = {item["id"]: item for item in _all(pool, "bookings")}
        out = []
        for item in _all(pool, "feedback"):
            booking = bookings.get(_int(item.get("bookingId"), -1))
            guest = guests.get(_int(booking.get("guestId"), -1)) if booking else None
            package = packages.get(_int(booking.get("packageId"), -1)) if booking else None
            out.append({**item, "guestName": guest.get("name") if guest else None,
                        "packageName": package.get("name") if package else None})
        return out

    @router.get("/analytics/summary", dependencies=permission("reports:read"))
    def analytics_summary(actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        return _summary(pool)

    @router.get("/analytics/daily", dependencies=permission("reports:read"))
    def analytics_daily(actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        return {"days": _daily_series(pool)}

    @router.get("/analytics/by-park", dependencies=permission("reports:read"))
    def analytics_by_park(actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        parks = _all(pool, "parks")
        counts: Counter[str] = Counter()
        for booking in _all(pool, "bookings"):
            park = _find(parks, booking.get("parkId"))
            counts[park.get("name", "Other") if park else "Other"] += 1
        for park in parks:
            counts.setdefault(str(park.get("name", "Other")), 0)
        return {"parks": [{"park": park, "bookings": count} for park, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))]}

    @router.get("/analytics/payment-methods", dependencies=permission("reports:read"))
    def analytics_payment_methods(actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        methods = ["M-PESA", "CARD", "CASH", "BANK"]
        rows: list[dict[str, Any]] = []
        payments = _all(pool, "payments")
        for group in ("collected", "pending"):
            row: dict[str, Any] = {"status": group, **{method: 0 for method in methods}}
            for payment in payments:
                is_collected = payment.get("status") in {"SUCCESS", "MANUAL"}
                if is_collected != (group == "collected"):
                    continue
                method = str(payment.get("method") or ("M-PESA" if payment.get("mpesaRef") else "BANK")).upper()
                if method in row:
                    row[method] += _int(payment.get("amount"))
            rows.append(row)
        return {"methods": methods, "rows": rows}

    @router.get("/analytics/driver-utilisation", dependencies=permission("reports:read"))
    def analytics_driver_utilisation(actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        assignments = _all(pool, "assignments")
        drivers = []
        for driver in _all(pool, "drivers"):
            active = [item for item in assignments if _int(item.get("driverId"), -1) == driver["id"]
                      and item.get("status") in {"WAITING", "ACCEPTED", "COMPLETED"}]
            drivers.append({"id": driver["id"], "name": driver.get("name", ""),
                            "active": bool(active), "assigned": len(active),
                            "utilisation": min(100, len(active) * 34)})
        return {"drivers": drivers}

    @router.post("/ai/forecast", dependencies=permission("reports:read"))
    def ai_forecast(body: Any = Body(default=None), actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        data = _body(body)
        months = data.get("months", [])
        bookings = data.get("bookings", [])
        if not isinstance(months, list) or not isinstance(bookings, list) or len(months) != len(bookings):
            raise DomainError(400, "VALIDATION", "months and bookings must be matching arrays.")
        months = [str(item)[:7] for item in months if re.match(r"^\d{4}-\d{2}$", str(item))]
        bookings = [max(0, _int(item)) for item in bookings[-len(months):]] if months else []
        points = [{"month": month, "bookings": bookings[index], "forecast": None, "lower": None, "upper": None}
                  for index, month in enumerate(months)]
        average = sum(bookings[-3:]) / max(1, len(bookings[-3:]))
        if months:
            year, month_num = map(int, months[-1].split("-"))
            last = date(year, month_num, 1)
        else:
            today = date.today()
            last = date(today.year, today.month, 1)
        for step in range(1, 4):
            month_num = last.month + step
            year = last.year + (month_num - 1) // 12
            month_num = (month_num - 1) % 12 + 1
            estimate = round(average, 1)
            points.append({"month": f"{year:04d}-{month_num:02d}", "bookings": 0,
                           "forecast": estimate, "lower": round(max(0, average * 0.85), 1),
                           "upper": round(average * 1.15, 1)})
        return {"points": points, "method": "sma3"}

    @router.post("/ai/anomalies", dependencies=permission("reports:read"))
    def ai_anomalies(body: Any = Body(default=None), actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        data = _body(body)
        kind = str(data.get("kind", ""))
        rows = data.get("rows", [])
        if not isinstance(rows, list):
            raise DomainError(400, "VALIDATION", "rows must be an array.")
        anomalies = []
        if kind == "payments":
            seen: set[str] = set()
            reported: set[str] = set()
            for row in rows:
                if not isinstance(row, Mapping):
                    continue
                reference = str(row.get("mpesaRef") or row.get("providerRef") or "")
                if reference and reference in seen and reference not in reported:
                    anomalies.append({"id": row.get("id"), "kind": "payment", "reason": f"Duplicate reference {reference}", "severity": "WARNING"})
                    reported.add(reference)
                if reference:
                    seen.add(reference)
        else:
            counts: Counter[str] = Counter()
            for row in rows:
                if not isinstance(row, Mapping):
                    continue
                start = str(row.get("startDate") or "")[:10]
                if not start:
                    continue
                counts[start] += 1
                if counts[start] == 4:
                    anomalies.append({"id": row.get("id"), "kind": "booking", "reason": f"Four trips start on {start}; check fleet capacity", "severity": "INFO"})
        return {"anomalies": anomalies}

    @router.post("/ai/sentiment", dependencies=permission("feedback:read"))
    def ai_sentiment(body: Any = Body(default=None), actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        data = _body(body)
        text = _text(data, "text", max_length=4000).casefold()
        positive = ("great", "good", "loved", "amazing", "excellent", "beautiful", "asante", "happy")
        negative = ("bad", "poor", "late", "dirty", "rude", "broken", "hot", "disappointed", "worst")
        pos = sum(word in text for word in positive)
        neg = sum(word in text for word in negative)
        sentiment = "positive" if pos > neg else "negative" if neg > pos else "neutral"
        return {"sentiment": sentiment, "score": max(-1, min(1, (pos - neg) / 6)),
                "topics": [topic for topic in ("driver", "vehicle", "wildlife", "food") if topic in text]}

    @router.post("/ai/draft-alert", dependencies=permission("alerts:write"))
    def ai_draft_alert(body: Any = Body(default=None), actor: dict[str, Any] = Depends(auth_dependency)) -> Any:
        del actor
        data = _body(body)
        description = _text(data, "description", max_length=4000)
        severity = data.get("severity") or "WARNING"
        alert_type = data.get("type") or "Safety"
        if severity not in ALERT_SEVERITIES:
            raise DomainError(400, "VALIDATION", "Alert severity is invalid.")
        active_bookings = [item for item in _all(pool, "bookings") if item.get("status") == "ACTIVE"]
        park_id = data.get("parkId")
        if park_id is not None:
            active_bookings = [item for item in active_bookings if _int(item.get("parkId"), -1) == _int(park_id, -2)]
        recipient_count = len({_int(item.get("guestId"), -1) for item in active_bookings})
        return {
            "type": str(alert_type), "severity": severity,
            "english": f"[{severity}] {alert_type}: {description} Please follow crew instructions and stay calm.",
            "swahili": f"[{severity}] {alert_type}: {description} Tafadhali fuata maagizo ya wafanyakazi na utulie.",
            "recipientCount": recipient_count,
        }

    return router


def booking_without_meta(item: Mapping[str, Any]) -> dict[str, Any]:
    """Keep DB-generated fields out of JSONB when changing an existing row."""
    return {key: value for key, value in item.items() if key not in {"id", "createdAt"}}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _validate_rate(entity: str, data: Mapping[str, Any], allowed: set[str], *, partial: bool) -> dict[str, Any]:
    result: dict[str, Any] = {}
    required_by_entity = {
        "parks": {"name"},
        "packages": {"name", "shortLabel", "parkId", "days", "marginPct", "active"},
        "parkFees": {"parkId", "residency", "perPersonPerDay", "conservancyPerPersonDay", "effectiveFrom"},
        "seasons": {"name", "startDate", "endDate", "multiplier"},
        "drivers": {"name", "phone", "dayRate", "active"},
        "vehicles": {"plate", "capacity", "dayRate", "active"},
    }
    required = set(data) if partial else required_by_entity[entity]
    missing = required - set(data)
    if missing:
        raise DomainError(400, "VALIDATION", "Required rate fields are missing.")
    for key, value in data.items():
        if key not in allowed:
            raise DomainError(400, "VALIDATION", "Unknown rate fields.")
        if key in {"name", "shortLabel", "plate"}:
            if not isinstance(value, str) or not value.strip() or len(value.strip()) > 120:
                raise DomainError(400, "VALIDATION", f"{key} is invalid.")
            result[key] = value.strip()
        elif key in {"emergencyContact", "certExpiry", "insuranceExpiry"}:
            if value is not None and (not isinstance(value, str) or len(value) > 120):
                raise DomainError(400, "VALIDATION", f"{key} is invalid.")
            result[key] = _date_text(value, key) if key in {"certExpiry", "insuranceExpiry"} and value else value
        elif key == "phone":
            phone = normalize_kenyan_phone(value)
            if not phone:
                raise DomainError(400, "INVALID_PHONE", "Enter a valid Kenyan mobile number.")
            result[key] = phone
        elif key == "residency":
            if value not in RESIDENCIES:
                raise DomainError(400, "VALIDATION", "Residency is invalid.")
            result[key] = value
        elif key in {"active"}:
            if not isinstance(value, bool):
                raise DomainError(400, "VALIDATION", f"{key} must be boolean.")
            result[key] = value
        elif key in {"parkId", "days", "capacity", "perPersonPerDay", "conservancyPerPersonDay", "dayRate"}:
            if isinstance(value, bool) or not isinstance(value, int) or value < 0:
                raise DomainError(400, "VALIDATION", f"{key} must be a non-negative integer.")
            if key in {"parkId", "days", "capacity"} and value == 0:
                raise DomainError(400, "VALIDATION", f"{key} must be greater than zero.")
            result[key] = value
        elif key in {"marginPct", "multiplier"}:
            if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(float(value)) or value < 0:
                raise DomainError(400, "VALIDATION", f"{key} is invalid.")
            result[key] = float(value)
        elif key in {"effectiveFrom", "startDate", "endDate"}:
            result[key] = _date_text(value, key)
    if entity == "seasons" and {"startDate", "endDate"} <= result.keys() and result["startDate"] > result["endDate"]:
        raise DomainError(400, "VALIDATION", "Season endDate must be on or after startDate.")
    return result
