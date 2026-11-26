import asyncio
import json
import logging
from contextlib import contextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from safaridesk.security_logging import WebhookQueryRedactionFilter
from safaridesk.telecom import build_telecom_router, send_sms, normalize_kenyan_phone


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


class FakePool:
    def __init__(self):
        self.state = {"sms": {}, "sessions": {}, "inbound": {}, "optouts": {}, "parks": []}

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
    assert first.text == "CON SafariDesk\n1. Safari destinations\n2. Booking help\n0. Exit"

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
    assert len(sent) == 1

    start = {"id": "provider-3", "from": PHONE, "text": "START"}
    assert client.post("/webhook/incoming", params={"token": TOKEN}, data=start).status_code == 200
    assert len(sent) == 2
    assert sent[1][2] == "START"
    assert pool.state["optouts"] == {}


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
