import asyncio
import hashlib
import hmac
import json
import logging
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from safaridesk.security_logging import WebhookQueryRedactionFilter
from safaridesk.telecom import build_telecom_router, send_sms, normalize_kenyan_phone, _phone_hash


PHONE = "+254712345678"
TOKEN = "webhook-test-token-" + "x" * 32
SERVICE_CODE = "*384*32966#"


def settings(**overrides):
    values = {
        "at_username": "sandbox",
        "at_api_key": "test-api-key",
        "at_sender_id": "SAFARIDESK",
        "at_test_phone": PHONE,
        "at_allowed_phones": (PHONE,),
        "webhook_token": TOKEN,
        "public_base_url": "https://example.ngrok-free.dev",
        "public_app_url": "https://app.example.test",
        "at_ussd_service_code": SERVICE_CODE,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


class Cursor:
    def __init__(self, row=None, rows=None):
        self.row = row
        self.rows = rows or []

    def fetchone(self):
        return self.row

    def fetchall(self):
        return self.rows


class FakeConnection:
    def __init__(self, state):
        self.state = state

    def execute(self, sql, params=()):
        normalized = " ".join(sql.lower().split())
        if normalized.startswith("select 1 from sms_opt_outs"):
            return Cursor({"1": 1} if params[0] in self.state["optouts"] else None)

        if normalized.startswith("select payload from business_records where record_type = %s"):
            return Cursor(rows=[{"payload": {"name": item["name"]}} for item in self.state["parks"]])

        if normalized.startswith("select id, payload from business_records where record_type = %s"):
            return Cursor(rows=[{"id": item.get("id", index), "payload": {"name": item["name"]}}
                                for index, item in enumerate(self.state["parks"], 1)])

        if normalized.startswith("select id, payload, created_at from business_records"):
            record_type = params[0]
            records = [item for item in self.state["records"] if item["record_type"] == record_type]
            if "and id = %s" in normalized:
                records = [item for item in records if item["id"] == int(params[1])]
            if "payload->>'providerref' = %s" in normalized:
                records = [item for item in records if item["payload"].get("providerRef") == params[1]]
            rows = [{"id": item["id"], "payload": dict(item["payload"]), "created_at": item["created_at"]}
                    for item in records]
            return Cursor(rows[0] if rows else None, rows)

        if normalized.startswith("insert into business_records"):
            record_type, encoded = params
            record = {
                "id": self.state["next_record_id"],
                "record_type": record_type,
                "payload": json.loads(encoded),
                "created_at": datetime.now(timezone.utc),
            }
            self.state["next_record_id"] += 1
            self.state["records"].append(record)
            return Cursor({"id": record["id"]})

        if normalized.startswith("update business_records set payload = %s::jsonb, updated_at = now()"):
            encoded, record_type, record_id = params
            item = next((item for item in self.state["records"]
                         if item["record_type"] == record_type and item["id"] == int(record_id)), None)
            if item is None:
                return Cursor()
            item["payload"] = json.loads(encoded)
            return Cursor({"id": item["id"]})

        if normalized.startswith("update business_records set payload = %s::jsonb, updated_at = %s"):
            encoded, _updated_at, record_type, record_id = params
            item = next((item for item in self.state["records"]
                         if item["record_type"] == record_type and item["id"] == int(record_id)), None)
            if item is None:
                return Cursor()
            item["payload"] = json.loads(encoded)
            return Cursor()

        if normalized.startswith("delete from sms_booking_sessions where expires_at <= %s"):
            now = params[0]
            self.state["booking_sessions"] = {
                key: item for key, item in self.state["booking_sessions"].items()
                if item["expires_at"] > now
            }
            return Cursor()

        if normalized.startswith("select state, expires_at from sms_booking_sessions"):
            return Cursor(self.state["booking_sessions"].get(params[0]))

        if normalized.startswith("insert into sms_booking_sessions"):
            phone_hash, raw_state, expires_at, updated_at = params
            self.state["booking_sessions"][phone_hash] = {
                "state": json.loads(raw_state), "expires_at": expires_at, "updated_at": updated_at,
            }
            return Cursor()

        if normalized.startswith("delete from sms_booking_sessions"):
            self.state["booking_sessions"].pop(params[0], None)
            return Cursor()

        if normalized.startswith("insert into sms_messages"):
            (row_id, provider_id, recipient_hash, event_kind, api_status,
             api_status_code, cost, created_at, updated_at) = params
            old = self.state["sms"].get(provider_id, {})
            self.state["sms"][provider_id] = {
                **old,
                "id": row_id,
                "provider_message_id": provider_id,
                "recipient_hash": recipient_hash,
                "event_kind": event_kind,
                "api_status": api_status,
                "api_status_code": api_status_code,
                "cost": cost,
                "delivery_status": old.get("delivery_status"),
                "created_at": created_at,
                "updated_at": updated_at,
            }
            return Cursor()

        if normalized.startswith("select phone_hash, service_code, state, expires_at from ussd_sessions"):
            return Cursor(self.state["sessions"].get(params[0]))

        if normalized.startswith("insert into ussd_sessions"):
            session_id, phone_hash, service_code, raw_state, expires_at, updated_at = params
            self.state["sessions"][session_id] = {
                "phone_hash": phone_hash,
                "service_code": service_code,
                "state": json.loads(raw_state),
                "expires_at": expires_at,
                "updated_at": updated_at,
            }
            return Cursor()

        if normalized.startswith("insert into sms_inbound"):
            provider_id, sender_hash, command, created_at = params
            if provider_id in self.state["inbound"]:
                return Cursor()
            self.state["inbound"][provider_id] = {
                "sender_hash": sender_hash,
                "command": command,
                "created_at": created_at,
            }
            return Cursor({"id": len(self.state["inbound"])})

        if normalized.startswith("insert into sms_opt_outs"):
            phone_hash, opted_out_at = params
            self.state["optouts"][phone_hash] = opted_out_at
            return Cursor()

        if normalized.startswith("delete from sms_opt_outs"):
            self.state["optouts"].pop(params[0], None)
            return Cursor()

        if normalized.startswith("update sms_messages"):
            delivery_status, updated_at, provider_id = params
            if provider_id in self.state["sms"]:
                self.state["sms"][provider_id]["delivery_status"] = delivery_status
                self.state["sms"][provider_id]["updated_at"] = updated_at
            return Cursor()

        raise AssertionError(f"Unexpected SQL in fake database: {normalized}")

    @contextmanager
    def transaction(self):
        yield self


class FakePool:
    def __init__(self):
        self.state = {
            "sms": {}, "sessions": {}, "booking_sessions": {}, "inbound": {}, "optouts": {},
            "parks": [], "records": [], "next_record_id": 1,
        }

    @contextmanager
    def connection(self):
        yield FakeConnection(self.state)


def run(coro):
    return asyncio.run(coro)


def make_app(pool=None, config=None, **router_kwargs):
    app = FastAPI()
    app.include_router(build_telecom_router(pool or FakePool(), config or settings(), **router_kwargs))
    return app


def test_sms_sandbox_omits_sender_and_persists_only_hash_and_status():
    pool = FakePool()
    seen = {}

    def provider(request):
        seen["url"] = str(request.url)
        seen["headers"] = request.headers
        seen["form"] = parse_qs(request.content.decode())
        return httpx.Response(201, json={
            "SMSMessageData": {
                "Recipients": [{
                    "messageId": "AT-sandbox-1",
                    "status": "Sent",
                    "statusCode": 101,
                    "cost": "KES 0.00",
                }]
            }
        })

    result = run(send_sms(
        pool,
        settings(),
        "0712 345 678",
        "  SafariDesk test update  ",
        transport=httpx.MockTransport(provider),
    ))

    assert result["accepted"] is True
    assert result["providerStatusCode"] == 101
    assert seen["url"].startswith("https://api.sandbox.africastalking.com/")
    assert seen["headers"]["apiKey"] == "test-api-key"
    assert seen["form"]["to"] == [PHONE]
    assert "from" not in seen["form"]
    persisted = pool.state["sms"]["AT-sandbox-1"]
    assert persisted["api_status_code"] == 101
    assert persisted["recipient_hash"] != PHONE
    assert "phone" not in persisted and "message" not in persisted


def test_sms_live_includes_configured_sender_id():
    seen = {}

    def provider(request):
        seen["url"] = str(request.url)
        seen["form"] = parse_qs(request.content.decode())
        return httpx.Response(201, json={
            "SMSMessageData": {"Recipients": [{"messageId": "AT-live-1", "status": "Sent", "statusCode": 101}]}
        })

    result = run(send_sms(
        FakePool(),
        settings(at_username="live-account", at_sender_id="SAFARIDESK"),
        PHONE,
        "Update",
        transport=httpx.MockTransport(provider),
    ))
    assert result["accepted"] is True
    assert seen["url"].startswith("https://api.africastalking.com/")
    assert seen["form"]["from"] == ["SAFARIDESK"]


def test_sms_preserves_invalid_sender_code_402():
    def provider(_request):
        return httpx.Response(201, json={
            "SMSMessageData": {"Recipients": [{"status": "InvalidSenderId", "statusCode": 402}]}
        })

    result = run(send_sms(
        FakePool(),
        settings(),
        PHONE,
        "Update",
        transport=httpx.MockTransport(provider),
    ))
    assert result["accepted"] is False
    assert result["providerStatus"] == "InvalidSenderId"
    assert result["providerStatusCode"] == 402
    assert result["providerErrorCode"] == "402"


def test_sms_allowlist_blocks_before_provider_call():
    calls = []
    result = run(send_sms(
        FakePool(),
        settings(at_allowed_phones=("+254722222222",)),
        PHONE,
        "Update",
        transport=httpx.MockTransport(lambda request: calls.append(request)),
    ))
    assert result == {"accepted": False, "reason": "not_allowed", "recipients": []}
    assert calls == []


def test_sms_help_can_be_requested_after_opt_out_but_destination_replies_stay_off():
    pool = FakePool()
    config = settings()
    pool.state["optouts"][_phone_hash(PHONE, config)] = datetime.now(timezone.utc)
    calls = []

    def provider(request):
        calls.append(request)
        return httpx.Response(201, json={
            "SMSMessageData": {
                "Recipients": [{"messageId": "AT-help-after-stop", "status": "Sent", "statusCode": 101}]
            }
        })

    help_result = run(send_sms(
        pool,
        config,
        PHONE,
        "Text PARKS for options.",
        event_kind="HELP",
        transport=httpx.MockTransport(provider),
    ))
    assert help_result["accepted"] is True
    assert len(calls) == 1

    parks_result = run(send_sms(
        pool,
        config,
        PHONE,
        "SafariDesk parks: 1. Maasai Mara.",
        event_kind="PARKS",
        transport=httpx.MockTransport(provider),
    ))
    assert parks_result == {"accepted": False, "reason": "opted_out", "recipients": []}
    assert len(calls) == 1


def test_ussd_returns_persistent_con_and_end_plain_text():
    pool = FakePool()
    app = make_app(pool)
    client = TestClient(app)

    first = client.post("/ussd", params={"token": TOKEN}, data={
        "sessionId": "session-one",
        "serviceCode": SERVICE_CODE,
        "phoneNumber": PHONE,
        "text": "",
    })
    assert first.status_code == 200
    assert first.headers["content-type"].startswith("text/plain")
    assert first.text == "CON SafariDesk\n1. Safari destinations\n2. Request booking\n3. Pay a deposit\n4. Booking help\n0. Exit"

    selected = client.post("/ussd", params={"token": TOKEN}, data={
        "sessionId": "session-one",
        "serviceCode": SERVICE_CODE,
        "phoneNumber": PHONE,
        "text": "1",
    })
    assert selected.status_code == 200
    assert selected.text.startswith("CON Safari destinations\n1. Maasai Mara")
    assert "2. Amboseli" in selected.text and "3. Tsavo East" in selected.text
    assert "9. More destinations" in selected.text

    detail = client.post("/ussd", params={"token": TOKEN}, data={
        "sessionId": "session-one",
        "serviceCode": SERVICE_CODE,
        "phoneNumber": PHONE,
        "text": "1*1",
    })
    assert detail.status_code == 200
    assert detail.text.startswith("END Maasai Mara Reserve: Great Migration and Big Five")

    replay = client.post("/ussd", params={"token": TOKEN}, data={
        "sessionId": "session-one",
        "serviceCode": SERVICE_CODE,
        "phoneNumber": PHONE,
        "text": "1*1",
    })
    assert replay.text == detail.text
    stored = pool.state["sessions"]["session-one"]
    assert stored["phone_hash"] != PHONE
    assert stored["state"]["response_text"] == detail.text


def test_ussd_destination_pages_and_back_navigation():
    client = TestClient(make_app())

    def select(text):
        return client.post("/ussd", params={"token": TOKEN}, data={
            "sessionId": "pages-session",
            "serviceCode": SERVICE_CODE,
            "phoneNumber": PHONE,
            "text": text,
        })

    assert "Safari destinations" in select("").text
    first_page = select("1")
    assert first_page.text.startswith("CON Safari destinations")
    second_page = select("1*9")
    assert "Nairobi National Park" in second_page.text
    detail = select("1*9*1")
    assert detail.text.startswith("END Nairobi National Park: Wildlife drives")
    back = select("1*9*0")
    assert back.text.startswith("CON Safari destinations") and "Maasai Mara" in back.text


def test_ussd_prefers_operator_parks_from_postgres_catalog():
    pool = FakePool()
    pool.state["parks"] = [{"name": "Ol Pejeta Conservancy"}]
    client = TestClient(make_app(pool))
    common = {"token": TOKEN}
    payload = {"sessionId": "catalog-session", "serviceCode": SERVICE_CODE, "phoneNumber": PHONE}

    client.post("/ussd", params=common, data={**payload, "text": ""})
    menu = client.post("/ussd", params=common, data={**payload, "text": "1"})
    assert "Ol Pejeta Conservancy" in menu.text
    detail = client.post("/ussd", params=common, data={**payload, "text": "1*1"})
    assert detail.text.startswith("END Ol Pejeta Conservancy: Ask SafariDesk")


def test_ussd_alias_and_auth_failures_are_at_compatible():
    client = TestClient(make_app())
    payload = {"sessionId": "alias-session", "serviceCode": SERVICE_CODE, "phoneNumber": PHONE, "text": ""}
    alias = client.post("/api/webhooks/africastalking/ussd", params={"token": TOKEN}, data=payload)
    assert alias.status_code == 200
    assert alias.text.startswith("CON ")

    bad_auth = client.post("/ussd", data=payload)
    assert bad_auth.status_code == 401
    assert bad_auth.headers["content-type"].startswith("text/plain")
    assert bad_auth.text.startswith("END ")

    wrong_code = client.post("/ussd", params={"token": TOKEN}, data={**payload, "serviceCode": "*123#"})
    assert wrong_code.status_code == 403
    assert wrong_code.text.startswith("END ")


def test_ussd_requires_form_encoding():
    response = TestClient(make_app()).post(
        "/ussd",
        params={"token": TOKEN},
        json={"sessionId": "bad", "serviceCode": SERVICE_CODE, "phoneNumber": PHONE},
    )
    assert response.status_code == 415
    assert response.text.startswith("END ")


def test_inbound_sms_is_idempotent_and_obeys_stop_start():
    pool = FakePool()
    sent = []

    async def sender(_pool, _settings, phone, message, event_kind="notification"):
        sent.append((phone, message, event_kind))
        return {"accepted": True}

    client = TestClient(make_app(pool, sms_sender=sender))
    stop = {"id": "provider-1", "from": PHONE, "text": "STOP"}
    assert client.post("/webhook/incoming", params={"token": TOKEN}, data=stop).status_code == 200
    assert len(sent) == 1
    assert sent[0][2] == "STOP"
    assert pool.state["inbound"]["provider-1"]["command"] == "STOP"
    assert pool.state["inbound"]["provider-1"]["sender_hash"] != PHONE

    # AT retry with the same message ID must not send a duplicate reply.
    assert client.post("/webhook/incoming", params={"token": TOKEN}, data=stop).status_code == 200
    assert len(sent) == 1

    help_message = {"id": "provider-2", "from": PHONE, "text": "HELP"}
    assert client.post("/webhook/incoming", params={"token": TOKEN}, data=help_message).status_code == 200
    assert len(sent) == 2
    assert sent[1][2] == "HELP"
    assert "PARKS" in sent[1][1]

    # A user can still ask for help after opting out; service updates stay off.
    parks_message = {"id": "provider-3", "from": PHONE, "text": "PARKS"}
    assert client.post("/webhook/incoming", params={"token": TOKEN}, data=parks_message).status_code == 200
    assert len(sent) == 2

    start = {"id": "provider-4", "from": PHONE, "text": "START"}
    assert client.post("/webhook/incoming", params={"token": TOKEN}, data=start).status_code == 200
    assert len(sent) == 3
    assert sent[2][2] == "START"
    assert pool.state["optouts"] == {}


def test_inbound_sms_browses_postgres_destinations_and_sends_details():
    pool = FakePool()
    pool.state["parks"] = [
        {"name": "Maasai Mara"},
        {"name": "Amboseli"},
        {"name": "Tsavo East"},
        {"name": "Nairobi National Park"},
        {"name": "Ol Pejeta Conservancy"},
        {"name": "Samburu National Reserve"},
        {"name": "Lewa Wildlife Conservancy"},
        {"name": "Meru National Park"},
        {"name": "Mount Kenya National Park"},
        {"name": "Lake Nakuru National Park"},
        {"name": "Kakamega Forest"},
        {"name": "Aberdare National Park"},
    ]
    sent = []

    async def sender(_pool, _settings, phone, message, event_kind="notification"):
        sent.append((phone, message, event_kind))
        return {"accepted": True}

    client = TestClient(make_app(pool, sms_sender=sender))

    def send(provider_id, text):
        return client.post(
            "/webhook/incoming",
            params={"token": TOKEN},
            data={"id": provider_id, "from": PHONE, "text": text},
        )

    assert send("sms-help", "help").status_code == 200
    assert "PARKS" in sent[-1][1] and "BOOK" in sent[-1][1]

    assert send("sms-parks", "parks").status_code == 200
    assert "1. Maasai Mara" in sent[-1][1]
    assert "2. Amboseli" in sent[-1][1]
    assert "3. Tsavo East" in sent[-1][1]
    assert "4. Nairobi" in sent[-1][1]
    assert "PARKS 2" in sent[-1][1]
    assert len(sent[-1][1]) <= 160

    assert send("sms-parks-page-2", "PARKS 2").status_code == 200
    assert "5. Ol Pejeta" in sent[-1][1]
    assert "6. Samburu" in sent[-1][1]

    assert send("sms-parks-page-zero", "PARKS 0").status_code == 200
    assert "Text PARKS to browse destinations" in sent[-1][1]
    assert send("sms-parks-page-three", "PARKS 3").status_code == 200
    assert "9. Mount Kenya" in sent[-1][1]
    assert "12. Aberdare" in sent[-1][1]
    assert len(sent[-1][1]) <= 160

    assert send("sms-parks-page-four", "PARKS 4").status_code == 200
    assert "no more destinations" in sent[-1][1]

    assert send("sms-mara", "mara").status_code == 200
    assert sent[-1][2] == "DESTINATION"
    assert sent[-1][1].startswith("Maasai Mara Reserve: Great Migration and Big Five")

    assert send("sms-number", "2").status_code == 200
    assert sent[-1][1].startswith("Amboseli National Park: Elephant herds and views")

    assert send("sms-number-page-2", "6").status_code == 200
    assert sent[-1][1].startswith("Samburu National Reserve: Ask SafariDesk")

    assert send("sms-number-page-3", "12").status_code == 200
    assert sent[-1][1].startswith("Aberdare National Park: Ask SafariDesk")

    assert send("sms-book", "book").status_code == 200
    assert "park name" in sent[-1][1] and "PARKS" in sent[-1][1]


def _seed_record(pool, record_type, payload):
    record_id = pool.state["next_record_id"]
    pool.state["next_record_id"] += 1
    pool.state["records"].append({
        "id": record_id,
        "record_type": record_type,
        "payload": dict(payload),
        "created_at": datetime.now(timezone.utc),
    })
    return record_id


def test_sms_booking_collects_guest_count_dates_pickup_and_contact():
    pool = FakePool()
    pool.state["parks"] = [{"id": 41, "name": "Test Park"}]
    sent = []

    async def sender(_pool, _settings, phone, message, event_kind="notification"):
        sent.append((phone, message, event_kind))
        return {"accepted": True}

    client = TestClient(make_app(pool, sms_sender=sender))
    future = (date.today() + timedelta(days=30)).isoformat()

    def send(provider_id, text):
        return client.post("/webhook/incoming", params={"token": TOKEN}, data={
            "id": provider_id, "from": PHONE, "text": text,
        })

    assert "park name" in send("booking-0", "BOOK").text or "park name" in sent[-1][1]
    inputs = ["1", future, "3", "2", "Nairobi CBD", "Amara Otieno", "amara@example.com", "1", "YES"]
    for index, value in enumerate(inputs, start=1):
        response = send(f"booking-{index}", value)
        assert response.status_code == 200

    guest = next(item for item in pool.state["records"] if item["record_type"] == "guests")
    booking = next(item for item in pool.state["records"] if item["record_type"] == "bookings")
    assert guest["payload"]["email"] == "amara@example.com"
    assert booking["payload"]["source"] == "sms"
    assert booking["payload"]["parkId"] == 41
    assert booking["payload"]["pax"] == 3
    assert booking["payload"]["tripDays"] == 2
    assert booking["payload"]["pickupLocation"] == "Nairobi CBD"
    assert booking["payload"]["quoteStatus"] == "REQUESTED"
    assert booking["payload"]["total"] == 0 and booking["payload"]["depositDue"] == 0
    assert "dial" in sent[-1][1].lower() and "choose 3" in sent[-1][1].lower()


def test_ussd_booking_saves_same_trip_details_and_rejects_payment_until_quoted():
    pool = FakePool()
    pool.state["parks"] = [{"id": 41, "name": "Test Park"}]
    client = TestClient(make_app(pool))
    future = (date.today() + timedelta(days=30)).isoformat()
    fields = ["2", "2*1", f"2*1*{future}", f"2*1*{future}*3", f"2*1*{future}*3*2",
              f"2*1*{future}*3*2*Nairobi CBD", f"2*1*{future}*3*2*Nairobi CBD*Amara Otieno",
              f"2*1*{future}*3*2*Nairobi CBD*Amara Otieno*amara@example.com",
              f"2*1*{future}*3*2*Nairobi CBD*Amara Otieno*amara@example.com*1"]

    def ussd(text, session="booking-flow"):
        return client.post("/ussd", params={"token": TOKEN}, data={
            "sessionId": session, "serviceCode": SERVICE_CODE, "phoneNumber": PHONE, "text": text,
        })

    assert ussd(fields[0]).text.startswith("CON ")
    assert ussd(fields[1]).text.startswith("CON Enter travel start date")
    for text in fields[2:]:
        assert ussd(text).text.startswith("CON ")
    final = f"{fields[-1]}*1"
    assert "Booking request #" in ussd(final).text

    booking = next(item for item in pool.state["records"] if item["record_type"] == "bookings")
    guest = next(item for item in pool.state["records"] if item["record_type"] == "guests")
    assert booking["payload"]["source"] == "ussd"
    assert booking["payload"]["pax"] == 3 and booking["payload"]["tripDays"] == 2
    assert booking["payload"]["pickupLocation"] == "Nairobi CBD"
    assert guest["payload"]["email"] == "amara@example.com"
    assert ussd(f"3*{booking['id']}", session="pay-before-quote").text == f"END Booking #{booking['id']} needs an operator quote before payment."


def test_ussd_paystack_payment_is_idempotent_and_webhook_marks_only_verified_amount():
    pool = FakePool()
    guest_id = _seed_record(pool, "guests", {
        "name": "Amara Otieno", "phone": PHONE, "email": "amara@example.com", "residency": "citizen",
    })
    booking_id = _seed_record(pool, "bookings", {
        "guestId": guest_id, "quoteStatus": "QUOTED", "depositDue": 1500,
        "total": 5000, "status": "PENDING",
    })
    calls = []

    def charger(secret, *, email, amount_kes, reference):
        calls.append((secret, email, amount_kes, reference))
        return {"accepted": True, "reference": reference, "accountNumber": "123456", "accountReference": reference}

    config = settings(paystack_secret_key="sk_test_example", at_allowed_phones=(PHONE, "+254722222222"))
    client = TestClient(make_app(pool, config, paystack_charger=charger))
    payload = {"serviceCode": SERVICE_CODE, "phoneNumber": PHONE}
    other_user = client.post("/ussd", params={"token": TOKEN}, data={
        **payload, "sessionId": "not-owner", "phoneNumber": "+254722222222", "text": f"3*{booking_id}",
    })
    assert "not linked to your phone" in other_user.text and calls == []
    first = client.post("/ussd", params={"token": TOKEN}, data={**payload, "sessionId": "pay-session", "text": "3"})
    assert first.text.startswith("CON Enter your booking number")
    payment_response = client.post("/ussd", params={"token": TOKEN}, data={
        **payload, "sessionId": "pay-session", "text": f"3*{booking_id}",
    })
    assert payment_response.text == "END Paybill 123456; account " + calls[0][3] + "; KES 1500. Pay in M-Pesa: Lipa na M-Pesa > Paybill."
    replay = client.post("/ussd", params={"token": TOKEN}, data={
        **payload, "sessionId": "pay-session", "text": f"3*{booking_id}",
    })
    assert replay.text == payment_response.text and len(calls) == 1

    payment = next(item for item in pool.state["records"] if item["record_type"] == "payments")
    reference = payment["payload"]["providerRef"]
    body = json.dumps({"event": "charge.success", "data": {
        "reference": reference, "status": "success", "currency": "KES", "amount": 150000,
    }}).encode()
    signature = hmac.new(b"sk_test_example", body, hashlib.sha512).hexdigest()
    webhook = client.post("/api/webhooks/paystack", content=body, headers={
        "content-type": "application/json", "x-paystack-signature": signature,
    })
    assert webhook.status_code == 200
    assert payment["payload"]["status"] == "SUCCESS"
    assert next(item for item in pool.state["records"] if item["record_type"] == "bookings")["payload"]["status"] == "DEPOSIT_PAID"
    duplicate = client.post("/api/webhooks/paystack", content=body, headers={
        "content-type": "application/json", "x-paystack-signature": signature,
    })
    assert duplicate.status_code == 200


def test_sms_pay_instruction_requires_guest_booking_ownership():
    pool = FakePool()
    guest_id = _seed_record(pool, "guests", {"phone": PHONE, "email": "amara@example.com"})
    booking_id = _seed_record(pool, "bookings", {"guestId": guest_id, "quoteStatus": "QUOTED", "depositDue": 1500})
    sent = []

    async def sender(_pool, _settings, phone, message, event_kind="notification"):
        sent.append(message)
        return {"accepted": True}

    client = TestClient(make_app(pool, sms_sender=sender))
    response = client.post("/webhook/incoming", params={"token": TOKEN}, data={
        "id": "sms-pay", "from": PHONE, "text": f"PAY {booking_id}",
    })
    assert response.status_code == 200
    assert SERVICE_CODE in sent[-1] and "choose 3" in sent[-1].lower() and str(booking_id) in sent[-1]


def test_delivery_report_accepts_query_token_and_maps_delivered_to_success():
    pool = FakePool()
    pool.state["sms"]["AT-message-1"] = {
        "api_status": "Sent",
        "api_status_code": 101,
            "cost": "KES 0.00",
        "delivery_status": None,
    }
    client = TestClient(make_app(pool))
    response = client.post(
        f"/api/webhooks/africastalking/sms-status?token={TOKEN}",
        data={"id": "AT-message-1", "status": "Delivered", "phoneNumber": PHONE},
    )
    assert response.status_code == 200
    assert response.text == "OK"
    assert pool.state["sms"]["AT-message-1"]["delivery_status"] == "Success"


def test_delivery_report_does_not_trust_ngrok_injected_header_alone():
    response = TestClient(make_app()).post(
        "/api/webhooks/africastalking/sms-status",
        headers={"x-webhook-token": TOKEN},
        data={"id": "AT-message-1", "status": "Sent"},
    )
    assert response.status_code == 401


def test_webhook_access_log_redacts_callback_query_token():
    record = logging.LogRecord(
        name="uvicorn.access",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg='%s - "%s %s HTTP/%s" %d',
        args=("127.0.0.1:1234", "POST", "/api/webhooks/africastalking/ussd?token=secret-value", "1.1", 200),
        exc_info=None,
    )

    assert WebhookQueryRedactionFilter().filter(record)
    rendered = record.getMessage()
    assert "secret-value" not in rendered
    assert "/api/webhooks/africastalking/ussd" in rendered


def test_bad_query_token_is_not_rescued_by_ngrok_header():
    response = TestClient(make_app()).post(
        "/api/webhooks/africastalking/sms-status?token=wrong",
        headers={"x-webhook-token": TOKEN},
        data={"id": "AT-message-1", "status": "Sent"},
    )
    assert response.status_code == 401


@pytest.mark.parametrize("value,expected", [
    ("0712345678", PHONE),
    ("254712345678", PHONE),
    (PHONE, PHONE),
    ("+14155550123", None),
])
def test_phone_normalization(value, expected):
    assert normalize_kenyan_phone(value) == expected
