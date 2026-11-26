from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from safaridesk.auth import ApiError
from safaridesk.domain import build_domain_router


class Cursor:
    def __init__(self, rows: list[tuple[Any, ...]] | None = None):
        self.rows = rows or []

    def fetchone(self) -> tuple[Any, ...] | None:
        return self.rows[0] if self.rows else None

    def fetchall(self) -> list[tuple[Any, ...]]:
        return list(self.rows)


class FakeConnection:
    """SQL-contract fake; route code still uses PostgreSQL JSONB SQL."""

    def __init__(self, state: dict[str, Any]):
        self.state = state

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> Cursor:
        statement = " ".join(sql.lower().split())
        if statement.startswith("select id, payload, created_at from business_records"):
            record_type = params[0]
            items = [item for item in self.state["records"] if item["record_type"] == record_type]
            if "and id = %s" in statement:
                wanted = int(params[1])
                items = [item for item in items if item["id"] == wanted]
            return Cursor([(item["id"], dict(item["payload"]), item["created_at"]) for item in items])

        if statement.startswith("insert into business_records"):
            record_type, encoded = params
            record = {
                "id": self.state["next_id"],
                "record_type": record_type,
                "payload": json.loads(encoded),
                "created_at": datetime.now(timezone.utc),
            }
            self.state["next_id"] += 1
            self.state["records"].append(record)
            return Cursor([(record["id"], dict(record["payload"]), record["created_at"])])

        if statement.startswith("update business_records set payload"):
            encoded, record_type, record_id = params
            record = next((item for item in self.state["records"]
                           if item["record_type"] == record_type and item["id"] == int(record_id)), None)
            if record is None:
                return Cursor()
            record["payload"] = json.loads(encoded)
            return Cursor([(record["id"], dict(record["payload"]), record["created_at"])])

        raise AssertionError(f"Unexpected SQL in domain test: {statement}")


class FakePool:
    def __init__(self):
        self.state = {"records": [], "next_id": 1}

    @contextmanager
    def connection(self):
        yield FakeConnection(self.state)


def make_client(pool: FakePool | None = None, *, sms_sender=None):
    pool = pool or FakePool()
    permissions: list[str] = []

    def permission_factory(permission: str):
        def check_permission():
            permissions.append(permission)
        return check_permission

    app = FastAPI()
    @app.exception_handler(ApiError)
    def api_error_handler(_request, exc):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=exc.status, content={"error": exc.message, "code": exc.code})

    app.include_router(build_domain_router(
        pool,
        SimpleNamespace(at_allowed_phones=(), at_ussd_service_code="*384*32966#"),
        lambda: {"id": "operator-1", "role": "admin"},
        permission_factory,
        sms_sender,
    ))
    return TestClient(app, raise_server_exceptions=False), pool, permissions


def setup_rates(client: TestClient) -> tuple[int, int]:
    park = client.post("/api/rates/parks", json={"name": "Test Park"})
    assert park.status_code == 201, park.text
    park_id = park.json()["id"]
    package = client.post("/api/rates/packages", json={
        "name": "Two-day safari", "shortLabel": "Safari 2d", "parkId": park_id,
        "days": 2, "marginPct": 10, "active": True,
    })
    assert package.status_code == 201, package.text
    client.post("/api/rates/parkFees", json={
        "parkId": park_id, "residency": "citizen", "perPersonPerDay": 1000,
        "conservancyPerPersonDay": 100, "effectiveFrom": "2026-01-01",
    })
    client.post("/api/rates/drivers", json={
        "name": "Actual Driver", "phone": "0712345678", "dayRate": 500,
        "active": True,
    })
    client.post("/api/rates/vehicles", json={
        "plate": "KDA 123A", "capacity": 6, "dayRate": 1000, "active": True,
    })
    return park_id, package.json()["id"]


def make_booking(client: TestClient, package_id: int, *, phone: str = "+254712345678", date: str = "2027-02-01"):
    return client.post("/api/bookings", json={
        "guestName": "Real Guest", "phone": phone, "packageId": package_id,
        "startDate": date, "pax": 2, "residency": "citizen", "depositPct": 30,
    })


def test_empty_database_returns_empty_records_and_zero_analytics():
    client, pool, permissions = make_client()

    assert client.get("/api/bookings").json() == []
    assert client.get("/api/drivers").json() == []
    assert client.get("/api/vehicles").json() == []
    assert client.get("/api/payments").json() == []
    assert client.get("/api/payments/reconciliation").json() == {"matched": [], "mismatched": [], "unmatched": []}
    assert client.get("/api/alerts").json() == []
    assert client.get("/api/feedback").json() == []
    assert client.get("/api/rates").json() == {
        "parks": [], "packages": [], "parkFees": [], "seasons": [], "vehicles": [], "drivers": [],
    }
    summary = client.get("/api/analytics/summary").json()
    assert summary == {
        "byStatus": {}, "revenuePaid": 0, "depositsDue": 0, "departing7Days": [],
        "unallocated": 0, "monthly": summary["monthly"], "activeGuests": 0,
    }
    assert len(summary["monthly"]) == 6
    daily = client.get("/api/analytics/daily").json()["days"]
    assert len(daily) == 90
    assert all(day["bookings"] == day["revenue"] == day["prevBookings"] == day["prevRevenue"] == 0 for day in daily)
    assert client.get("/api/analytics/by-park").json() == {"parks": []}
    assert client.get("/api/analytics/driver-utilisation").json() == {"drivers": []}
    assert pool.state["records"] == []
    assert "bookings:read" in permissions and "reports:read" in permissions


def test_rates_quote_and_booking_are_persisted_and_joined_from_postgres_rows():
    client, pool, _ = make_client()
    park_id, package_id = setup_rates(client)

    quote = client.post("/api/quotes", json={
        "packageId": package_id, "pax": 2, "residency": "citizen", "start": "2027-02-01",
    })
    assert quote.status_code == 200
    assert quote.json() == {
        "total": 8140, "depositDue": 2442,
        "breakdown": {"parkFees": 4000, "conservancy": 400, "transport": 3000,
                      "seasonAdjustment": 0, "margin": 740},
    }

    created = make_booking(client, package_id)
    assert created.status_code == 201, created.text
    booking = created.json()
    assert booking["source"] == "web"
    assert booking["status"] == "PENDING"
    assert booking["guest"]["phone"] == "+254712345678"
    assert booking["packageName"] == "Two-day safari"
    assert booking["parkName"] == "Test Park"
    assert client.get("/api/bookings").json() == [booking]

    detail = client.get(f"/api/bookings/{booking['id']}").json()
    assert detail["payments"] == []
    assert detail["assignment"] is None
    assert detail["messages"] == []
    assert client.get("/api/rates/parks").json()[0]["id"] == park_id
    updated = client.patch(f"/api/rates/packages/{package_id}", json={"marginPct": 12})
    assert updated.status_code == 200
    assert updated.json()["marginPct"] == 12

    kinds = {item["record_type"] for item in pool.state["records"]}
    assert kinds == {"parks", "packages", "park_fees", "drivers", "vehicles", "guests", "bookings"}


def test_operator_quote_saves_rate_based_amount_and_sends_guest_ussd_steps():
    sent = []

    def sms_sender(phone, message, kind):
        sent.append((phone, message, kind))
        return {"accepted": True}

    client, pool, _ = make_client(sms_sender=sms_sender)
    park_id, package_id = setup_rates(client)
    booking = make_booking(client, package_id).json()
    record = next(item for item in pool.state["records"] if item["record_type"] == "bookings")
    record["payload"].update({
        "packageId": None, "total": 0, "depositDue": 0, "quoteBreakdown": None,
        "quoteStatus": "REQUESTED", "tripDays": 2, "destinationName": "Test Park",
        "source": "sms", "parkId": park_id, "residency": "citizen",
    })
    guest = next(item for item in pool.state["records"] if item["record_type"] == "guests")
    guest["payload"]["email"] = "guest@example.com"

    response = client.post(f"/api/bookings/{booking['id']}/quote", json={"packageId": package_id})
    assert response.status_code == 200, response.text
    quoted = response.json()
    assert quoted["quoteStatus"] == "QUOTED"
    assert quoted["total"] == 8140 and quoted["depositDue"] == 2442, quoted
    assert quoted["quoteSmsAccepted"] is True
    assert quoted["paymentInstructions"].startswith("Dial *384*32966#")
    assert sent[0][0] == "+254712345678" and sent[0][2] == "booking_quote"
    assert "KES 8140" in sent[0][1] and "KES 2442" in sent[0][1]
    assert "*384*32966#" in sent[0][1] and "choose 3" in sent[0][1]


def test_operator_can_quote_an_agreed_total_when_no_rates_are_configured():
    sent = []

    def sms_sender(phone, message, kind):
        sent.append((phone, message, kind))
        return {"accepted": True}

    client, pool, _ = make_client(sms_sender=sms_sender)
    pool.state["records"].extend([
        {"id": 1, "record_type": "guests", "payload": {
            "name": "Guest", "phone": "+254712345678", "email": "guest@example.com", "residency": "citizen",
        }, "created_at": datetime.now(timezone.utc)},
        {"id": 2, "record_type": "bookings", "payload": {
            "guestId": 1, "parkId": None, "destinationName": "Maasai Mara Reserve",
            "startDate": "2027-02-01", "endDate": "2027-02-02", "tripDays": 2,
            "pax": 3, "residency": "citizen", "total": 0, "depositDue": 0,
            "quoteBreakdown": None, "quoteStatus": "REQUESTED", "status": "PENDING", "source": "sms",
        }, "created_at": datetime.now(timezone.utc)},
    ])
    pool.state["next_id"] = 3

    response = client.post("/api/bookings/2/quote", json={"manualTotal": 25000, "depositPct": 40})
    assert response.status_code == 200, response.text
    quoted = response.json()
    assert quoted["total"] == 25000 and quoted["depositDue"] == 10000
    assert quoted["quoteBreakdown"] is None and quoted["quoteSource"] == "manual"
    assert quoted["quoteStatus"] == "QUOTED" and quoted["packageId"] is None
    assert sent and "KES 25000" in sent[0][1] and "KES 10000" in sent[0][1]


def test_payment_marking_and_reconciliation_are_derived_from_real_records():
    client, _, _ = make_client()
    _, package_id = setup_rates(client)
    booking = make_booking(client, package_id).json()

    pay = client.post(f"/api/bookings/{booking['id']}/pay")
    assert pay.status_code == 200 and pay.json()["ok"] is True
    assert len(client.get("/api/payments").json()) == 1
    marked = client.post(f"/api/bookings/{booking['id']}/mark-paid", json={"reference": "MPESA-123"})
    assert marked.status_code == 200
    assert marked.json()["status"] == "DEPOSIT_PAID"
    report = client.get("/api/payments/reconciliation").json()
    assert len(report["matched"]) == 1
    assert report["matched"][0]["mpesaRef"] == "MPESA-123"
    assert report["unmatched"] == []


def test_dispatch_conflict_and_sms_delivery_are_truthful():
    sent: list[tuple[str, str, str]] = []

    def sms_sender(phone, message, kind):
        sent.append((phone, message, kind))
        return {"accepted": True, "providerStatusCode": 101}

    client, _, _ = make_client(sms_sender=sms_sender)
    _, package_id = setup_rates(client)
    first = make_booking(client, package_id).json()
    second = make_booking(client, package_id, phone="+254722222222").json()
    driver_id = client.get("/api/drivers").json()[0]["id"]
    vehicle_id = client.get("/api/vehicles").json()[0]["id"]

    assigned = client.post(f"/api/bookings/{first['id']}/assign", json={"driverId": driver_id, "vehicleId": vehicle_id})
    assert assigned.status_code == 201
    assert sent and sent[0][2] == "assignment"
    conflict = client.post(f"/api/bookings/{second['id']}/assign", json={"driverId": driver_id, "vehicleId": vehicle_id})
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "CONFLICT"
    assignment_id = assigned.json()["id"]
    resent = client.post(f"/api/assignments/{assignment_id}/resend")
    assert resent.status_code == 200 and resent.json()["sms"]["accepted"] is True
    assert len(sent) == 2


def test_alerts_feedback_and_ai_use_only_submitted_rows():
    def sms_sender(_phone, _message, _kind):
        return {"accepted": False, "reason": "not_allowed"}

    client, pool, _ = make_client(sms_sender=sms_sender)
    _, package_id = setup_rates(client)
    booking = make_booking(client, package_id).json()
    client.patch(f"/api/bookings/{booking['id']}", json={"status": "ACTIVE"})

    alert = client.post("/api/alerts", json={
        "type": "Safety", "severity": "CRITICAL", "message": "Stay with the guide.",
    })
    assert alert.status_code == 201
    assert alert.json()["deliveries"][0]["status"] == "FAILED"
    assert client.get("/api/alerts").json()[0]["id"] == alert.json()["id"]

    forecast = client.post("/api/ai/forecast", json={"months": ["2026-01"], "bookings": [4]}).json()
    assert forecast["points"][0]["forecast"] is None
    assert len(forecast["points"]) == 4
    assert client.post("/api/ai/anomalies", json={"kind": "payments", "rows": []}).json() == {"anomalies": []}
    assert client.post("/api/ai/sentiment", json={"text": "Great driver"}).json()["sentiment"] == "positive"
    draft = client.post("/api/ai/draft-alert", json={"description": "Road is closed"}).json()
    assert draft["recipientCount"] == 1

    # No fake feedback is created; the API simply returns database records.
    assert client.get("/api/feedback").json() == []
    assert all(item["record_type"] != "feedback" for item in pool.state["records"])


def test_domain_validation_errors_use_error_and_code_json_shape():
    client, _, _ = make_client()
    response = client.post("/api/bookings", json={"guestName": "Guest"})
    assert response.status_code == 400
    assert set(response.json()) == {"error", "code"}
    assert response.json()["code"] == "VALIDATION"

