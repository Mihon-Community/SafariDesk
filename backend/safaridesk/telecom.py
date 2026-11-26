"""Africa's Talking SMS and USSD integration for SafariDesk.

The module accepts the database pool, settings, and HTTP transport as
dependencies. Tests can exercise provider responses without contacting AT or
requiring a PostgreSQL instance.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Mapping
from urllib.parse import parse_qsl

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger("safaridesk.telecom")

_SMS_OK_CODES = {100, 101, 102}
_USSD_FIELDS = {"sessionId", "serviceCode", "phoneNumber", "text", "networkCode"}
_INBOUND_SMS_FIELDS = {"id", "messageId", "from", "to", "text", "linkId", "date", "networkCode", "retryCount"}
_REPORT_FIELDS = {"id", "messageId", "status", "phoneNumber", "networkCode", "failureReason", "failureCode", "retryCount"}
_PROVIDER_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,120}$")
_USSD_SESSION_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")


def _setting(settings: Any, key: str, default: Any = "") -> Any:
    if isinstance(settings, Mapping):
        return settings.get(key, default)
    return getattr(settings, key, default)


def normalize_kenyan_phone(value: Any) -> str | None:
    """Return a canonical Kenyan mobile number, or None for invalid input."""
    if not isinstance(value, str):
        return None
    digits = re.sub(r"\D", "", value)
    if digits.startswith("0") and len(digits) == 10:
        digits = "254" + digits[1:]
    elif len(digits) == 9 and digits[0] in "17":
        digits = "254" + digits
    if not re.fullmatch(r"254[17]\d{8}", digits):
        return None
    return "+" + digits


def _allowed_phone(phone: str, settings: Any) -> bool:
    configured = _setting(settings, "at_allowed_phones", ()) or ()
    if isinstance(configured, str):
        configured = re.split(r"[,;\s]+", configured)
    numbers = {normalize_kenyan_phone(item) for item in configured}
    numbers.discard(None)
    return not numbers or phone in numbers


def _phone_hash(phone: str, settings: Any) -> str:
    secret = str(_setting(settings, "webhook_token") or _setting(settings, "at_api_key"))
    return hmac.new(secret.encode("utf-8"), phone.encode("utf-8"), hashlib.sha256).hexdigest()


def _clean_sms(message: Any) -> str | None:
    if not isinstance(message, str):
        return None
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", message).strip()
    return cleaned if cleaned and len(cleaned) <= 480 else None


def _db_execute(pool: Any, sql: str, params: tuple[Any, ...] = ()) -> Any:
    """Run one synchronous psycopg operation using the project's pool contract."""
    with pool.connection() as conn:
        return conn.execute(sql, params)


def _db_fetchone(pool: Any, sql: str, params: tuple[Any, ...] = ()) -> Any:
    with pool.connection() as conn:
        return conn.execute(sql, params).fetchone()


def _fetchone(cursor: Any) -> Any:
    return cursor.fetchone() if cursor is not None else None


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


def _is_opted_out(pool: Any, phone_hash: str) -> bool:
    row = _db_fetchone(
        pool,
        "SELECT 1 FROM sms_opt_outs WHERE phone_hash = %s",
        (phone_hash,),
    )
    return row is not None


def _persist_sms(
    pool: Any,
    *,
    provider_message_id: str,
    recipient_hash: str,
    event_kind: str,
    status: str,
    status_code: int | None,
    cost: str | None,
) -> None:
    now = datetime.now(timezone.utc)
    _db_execute(
        pool,
        """INSERT INTO sms_messages
             (id, provider_message_id, recipient_hash, event_kind,
              api_status, api_status_code, cost, delivery_status, created_at, updated_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, NULL, %s, %s)
           ON CONFLICT (provider_message_id) WHERE provider_message_id IS NOT NULL DO UPDATE SET
             api_status = EXCLUDED.api_status,
             api_status_code = EXCLUDED.api_status_code,
             cost = EXCLUDED.cost,
             updated_at = EXCLUDED.updated_at""",
        (uuid.uuid4(), provider_message_id, recipient_hash, event_kind,
         status, status_code, cost, now, now),
    )


async def send_sms(
    pool: Any,
    settings: Any,
    phone: str,
    message: str,
    event_kind: str = "notification",
    *,
    transport: httpx.AsyncBaseTransport | None = None,
) -> dict[str, Any]:
    """Send one SMS using AT's REST API; pass a MockTransport in tests."""
    normalized_phone = normalize_kenyan_phone(phone)
    if normalized_phone is None:
        return {"accepted": False, "reason": "invalid_phone", "recipients": []}
    if not _allowed_phone(normalized_phone, settings):
        return {"accepted": False, "reason": "not_allowed", "recipients": []}

    username = str(_setting(settings, "at_username")).strip()
    api_key = str(_setting(settings, "at_api_key")).strip()
    webhook_token = str(_setting(settings, "webhook_token")).strip()
    if not username or not api_key:
        return {"accepted": False, "reason": "not_configured", "recipients": []}

    # STOP and START confirmations acknowledge preference changes. Other
    # notifications are suppressed after STOP.
    if event_kind.upper() not in {"STOP", "START"} and webhook_token:
        opted_out = await run_in_threadpool(_is_opted_out, pool, _phone_hash(normalized_phone, settings))
        if opted_out:
            return {"accepted": False, "reason": "opted_out", "recipients": []}

    clean_message = _clean_sms(message)
    if clean_message is None:
        return {"accepted": False, "reason": "provider_error", "recipients": []}

    sandbox = username.lower() == "sandbox"
    base_url = "https://api.sandbox.africastalking.com" if sandbox else "https://api.africastalking.com"
    form: dict[str, str] = {
        "username": username,
        "to": normalized_phone,
        "message": clean_message,
    }
    sender_id = str(_setting(settings, "at_sender_id")).strip()
    if not sandbox and sender_id:
        form["from"] = sender_id

    try:
        async with httpx.AsyncClient(transport=transport, timeout=12.0) as client:
            response = await client.post(
                f"{base_url}/version1/messaging",
                headers={"apiKey": api_key, "Accept": "application/json"},
                data=form,
            )
    except httpx.RequestError as exc:
        # Do not log request headers, body, destination, or provider exception text.
        logger.warning("Africa's Talking SMS request failed (%s)", type(exc).__name__)
        return {
            "accepted": False,
            "reason": "provider_error",
            "providerErrorCode": type(exc).__name__,
            "recipients": [],
        }

    try:
        payload = response.json()
    except (ValueError, json.JSONDecodeError):
        payload = {}
    sms_data = payload.get("SMSMessageData", {}) if isinstance(payload, dict) else {}
    raw_recipients = sms_data.get("Recipients", []) if isinstance(sms_data, dict) else []
    recipients: list[dict[str, Any]] = []
    if isinstance(raw_recipients, list):
        for raw in raw_recipients:
            if not isinstance(raw, dict):
                continue
            try:
                status_code = int(raw.get("statusCode"))
            except (ValueError, TypeError):
                status_code = None
            recipients.append({
                "messageId": str(raw["messageId"])[:120] if raw.get("messageId") else None,
                "status": str(raw.get("status") or (status_code if status_code is not None else "Unknown"))[:40],
                "statusCode": status_code,
                "cost": str(raw["cost"])[:32] if raw.get("cost") else None,
            })

    http_ok = response.status_code in {200, 201, 202}
    accepted = http_ok and bool(recipients) and all(
        item["statusCode"] in _SMS_OK_CODES for item in recipients
    )
    for recipient in recipients:
        message_id = recipient.get("messageId")
        if message_id:
            await run_in_threadpool(
                _persist_sms,
                pool,
                provider_message_id=message_id,
                recipient_hash=_phone_hash(normalized_phone, settings),
                event_kind=event_kind[:80],
                status=recipient["status"],
                status_code=recipient["statusCode"],
                cost=recipient["cost"],
            )

    first = recipients[0] if recipients else {}
    status_code = first.get("statusCode")
    provider_error_code = None
    if not accepted:
        if status_code not in _SMS_OK_CODES and status_code is not None:
            provider_error_code = str(status_code)
        elif not http_ok:
            provider_error_code = str(response.status_code)
    return {
        "accepted": accepted,
        "providerHttpStatus": response.status_code,
        **({} if accepted else {"reason": "provider_error"}),
        **({"providerErrorCode": provider_error_code} if provider_error_code else {}),
        "providerStatus": first.get("status"),
        "providerStatusCode": status_code,
        "recipients": recipients,
    }


class _FormError(ValueError):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


async def _read_form(request: Request, allowed: set[str], limits: Mapping[str, int]) -> dict[str, str]:
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type != "application/x-www-form-urlencoded":
        raise _FormError("Expected a URL-encoded callback.", 415)
    raw = await request.body()
    if len(raw) > 8192:
        raise _FormError("Callback body too large.", 413)
    try:
        decoded = raw.decode("utf-8", errors="strict")
        pairs = parse_qsl(decoded, keep_blank_values=True, max_num_fields=16, strict_parsing=False)
    except (UnicodeDecodeError, ValueError):
        raise _FormError("Malformed callback.", 400) from None
    result: dict[str, str] = {}
    for key, value in pairs:
        if key not in allowed or key in result or len(value) > limits.get(key, 256):
            raise _FormError("Malformed callback.", 400)
        result[key] = value
    return result


def _required(data: Mapping[str, str], key: str) -> str:
    value = data.get(key)
    if value is None or value == "":
        raise _FormError("Malformed callback.", 400)
    return value


def _token_valid(request: Request, settings: Any) -> bool:
    expected = str(_setting(settings, "webhook_token")).strip()
    if len(expected.encode("utf-8")) < 32:
        return False
    query_tokens = request.query_params.getlist("token")
    if len(query_tokens) != 1:
        return False
    candidate = query_tokens[0]
    return hmac.compare_digest(expected.encode("utf-8"), candidate.encode("utf-8"))


def _ussd_end(message: str, status_code: int = 200) -> PlainTextResponse:
    return PlainTextResponse(f"END {message}", status_code=status_code)


def _menu_response(text: str, public_app_url: str) -> str:
    url = public_app_url.rstrip("/")
    if text == "":
        return "CON SafariDesk\n1. Browse safari options\n2. Booking help\n0. Exit"
    selections = text.split("*")
    if len(selections) > 4 or any(not re.fullmatch(r"\d{1,2}", item) for item in selections):
        return "END Invalid selection. Dial again to restart."
    if len(set(selections)) != len(selections):
        return "END That selection was repeated. Dial again to restart."
    if text == "0":
        return "END Thank you for using SafariDesk."
    if text == "1":
        return f"END Browse safari options at {url}/parks." if url else "END Contact your safari operator for current trip options."
    if text == "2":
        return "END For booking help, contact your safari operator. Text HELP for SMS assistance."
    return "END Invalid selection. Dial again to restart."


def _row_json(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
            return decoded if isinstance(decoded, dict) else {}
        except ValueError:
            return {}
    return {}


def _process_ussd(
    pool: Any,
    session_id: str,
    phone_hash: str,
    service_code: str,
    text: str,
    now: datetime,
    ttl_seconds: int,
    public_app_url: str,
) -> str:
    with pool.connection() as conn:
        row = _fetchone(conn.execute(
            "SELECT phone_hash, service_code, state, expires_at FROM ussd_sessions WHERE session_id = %s",
            (session_id,),
        ))
        if row is not None:
            old_phone_hash = _row_value(row, "phone_hash", 0)
            old_service = _row_value(row, "service_code", 1)
            state = _row_json(_row_value(row, "state", 2))
            expires_at = _row_value(row, "expires_at", 3)
            if isinstance(expires_at, str):
                try:
                    expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                except ValueError:
                    expires_at = None
            if isinstance(expires_at, datetime) and expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at and expires_at > now:
                if old_phone_hash != phone_hash or old_service != service_code:
                    return "END Invalid session. Dial again to restart."
                if state.get("input_text") == text:
                    response_text = str(state.get("response_text") or _menu_response(text, public_app_url))
                else:
                    response_text = _menu_response(text, public_app_url)
            elif text:
                response_text = "END Session expired. Dial again to restart."
            else:
                response_text = _menu_response(text, public_app_url)
        else:
            response_text = _menu_response(text, public_app_url)

        state_json = json.dumps({"input_text": text, "response_text": response_text})
        expires_at = now + timedelta(seconds=ttl_seconds)
        conn.execute(
            """INSERT INTO ussd_sessions
                 (session_id, phone_hash, service_code, state, expires_at, updated_at)
               VALUES (%s, %s, %s, %s::jsonb, %s, %s)
               ON CONFLICT (session_id) DO UPDATE SET
                 phone_hash = EXCLUDED.phone_hash,
                 service_code = EXCLUDED.service_code,
                 state = EXCLUDED.state,
                 expires_at = EXCLUDED.expires_at,
                 updated_at = EXCLUDED.updated_at""",
            (session_id, phone_hash, service_code, state_json, expires_at, now),
        )
    return response_text


def _classify_sms(text: str, public_app_url: str) -> tuple[str, str, str | None]:
    command_text = text.strip().upper()
    if command_text in {"STOP", "UNSUBSCRIBE", "CANCEL", "QUIT", "END"}:
        return "STOP", "SafariDesk SMS updates are stopped. Text START to re-enable service messages.", "stop"
    if command_text == "START":
        return "START", "SafariDesk service SMS is enabled. Text HELP for options.", "start"
    if command_text == "BOOK":
        app_url = public_app_url.rstrip("/")
        reply = (
            f"Browse safari options at {app_url}/parks. Contact your operator to complete a booking."
            if app_url
            else "To browse safari options, visit the SafariDesk website or contact your safari operator."
        )
        return "BOOK", reply, None
    return "HELP" if command_text == "HELP" else "OTHER", (
        "SafariDesk: text BOOK for safari options. Text STOP to stop service SMS or START to re-enable."
    ), None


def _persist_inbound(
    pool: Any,
    provider_message_id: str,
    preference: str | None,
    phone_hash: str,
    command: str,
) -> tuple[bool, bool]:
    with pool.connection() as conn:
        inserted = _fetchone(conn.execute(
            """INSERT INTO sms_inbound (provider_message_id, sender_hash, command, created_at)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING
               RETURNING id""",
            (provider_message_id, phone_hash, command, datetime.now(timezone.utc)),
        )) is not None
        if not inserted:
            return False, False
        if preference == "stop":
            conn.execute(
                """INSERT INTO sms_opt_outs (phone_hash, opted_out_at)
                   VALUES (%s, %s)
                   ON CONFLICT (phone_hash) DO UPDATE SET opted_out_at = EXCLUDED.opted_out_at""",
                (phone_hash, datetime.now(timezone.utc)),
            )
            opted_out = True
        elif preference == "start":
            conn.execute("DELETE FROM sms_opt_outs WHERE phone_hash = %s", (phone_hash,))
            opted_out = False
        else:
            opted_out = _fetchone(conn.execute(
                "SELECT 1 FROM sms_opt_outs WHERE phone_hash = %s",
                (phone_hash,),
            )) is not None
        return True, opted_out


def _report_status(value: str) -> str | None:
    statuses = {
        "sent": "Sent",
        "submitted": "Submitted",
        "buffered": "Buffered",
        "success": "Success",
        "delivered": "Success",
        "rejected": "Rejected",
        "failed": "Failed",
        "expired": "Expired",
    }
    return statuses.get(value.strip().lower())


def build_telecom_router(
    pool: Any,
    settings: Any,
    *,
    sms_sender: Callable[..., Awaitable[dict[str, Any]]] = send_sms,
    now: Callable[[], datetime] | None = None,
    session_ttl_seconds: int = 300,
) -> APIRouter:
    """Build the provider callback router using the supplied app dependencies."""
    router = APIRouter()
    clock = now or (lambda: datetime.now(timezone.utc))
    public_app_url = str(_setting(settings, "public_app_url"))

    async def handle_ussd(request: Request) -> Response:
        expected = str(_setting(settings, "webhook_token"))
        if not _token_valid(request, settings):
            code = 503 if len(expected.encode("utf-8")) < 32 else 401
            message = "USSD is not configured yet." if code == 503 else "Invalid callback authentication."
            return _ussd_end(message, code)
        try:
            data = await _read_form(request, _USSD_FIELDS, {"sessionId": 128, "serviceCode": 32, "phoneNumber": 16, "text": 160, "networkCode": 32})
            session_id = _required(data, "sessionId")
            service_code = _required(data, "serviceCode")
            phone = normalize_kenyan_phone(_required(data, "phoneNumber"))
            text = data.get("text", "")
            if not phone or not _USSD_SESSION_ID.fullmatch(session_id):
                return _ussd_end("Invalid session. Dial again to restart.", 400)
            configured_code = str(_setting(settings, "at_ussd_service_code")).strip()
            if not configured_code:
                return _ussd_end("USSD is not configured yet.", 503)
            if service_code != configured_code or not _allowed_phone(phone, settings):
                return _ussd_end("This service is unavailable for this number.", 403)
            response_text = await run_in_threadpool(
                _process_ussd,
                pool,
                session_id,
                _phone_hash(phone, settings),
                service_code,
                text,
                clock(),
                max(1, session_ttl_seconds),
                public_app_url,
            )
            return PlainTextResponse(response_text, status_code=200)
        except _FormError as exc:
            message = "Invalid callback format." if exc.status_code == 415 else "Invalid request. Dial again to restart."
            return _ussd_end(message, exc.status_code)
        except Exception:
            logger.exception("Africa's Talking USSD callback could not be processed")
            return _ussd_end("Please try again shortly.", 500)

    router.add_api_route("/ussd", handle_ussd, methods=["POST"], response_class=PlainTextResponse)
    router.add_api_route("/api/webhooks/africastalking/ussd", handle_ussd, methods=["POST"], response_class=PlainTextResponse)

    @router.post("/webhook/incoming")
    async def incoming_sms(request: Request) -> Response:
        expected = str(_setting(settings, "webhook_token"))
        if not _token_valid(request, settings):
            status = 503 if len(expected.encode("utf-8")) < 32 else 401
            return JSONResponse({"error": "Callback authentication is not configured." if status == 503 else "Unauthorized callback."}, status_code=status)
        try:
            data = await _read_form(request, _INBOUND_SMS_FIELDS, {"id": 120, "messageId": 120, "from": 16, "to": 32, "text": 480, "linkId": 64, "date": 64, "networkCode": 32, "retryCount": 8})
            if data.get("id") and data.get("messageId"):
                raise _FormError("Malformed callback.")
            provider_id = data.get("id") or data.get("messageId")
            phone = normalize_kenyan_phone(_required(data, "from"))
            message = _required(data, "text")
            if not provider_id or not _PROVIDER_ID.fullmatch(provider_id) or phone is None:
                return JSONResponse({"error": "Malformed SMS callback.", "code": "INVALID_CALLBACK"}, status_code=400)
            if not _allowed_phone(phone, settings):
                return JSONResponse({"error": "Sender not allowed.", "code": "PHONE_NOT_ALLOWED"}, status_code=403)
            command, reply, preference = _classify_sms(message, public_app_url)
            inserted, opted_out = await run_in_threadpool(
                _persist_inbound,
                pool,
                provider_id,
                preference,
                _phone_hash(phone, settings),
                command,
            )
            if inserted and (preference is not None or not opted_out):
                try:
                    await sms_sender(pool, settings, phone, reply, event_kind=command)
                except Exception:
                    logger.exception("Africa's Talking inbound SMS reply could not be sent")
            return PlainTextResponse("OK", status_code=200)
        except _FormError as exc:
            return JSONResponse({"error": str(exc), "code": "UNSUPPORTED_CALLBACK_TYPE" if exc.status_code == 415 else "INVALID_CALLBACK"}, status_code=exc.status_code)
        except Exception:
            logger.exception("Africa's Talking inbound SMS callback could not be persisted")
            return JSONResponse({"error": "Callback could not be processed.", "code": "CALLBACK_ERROR"}, status_code=500)

    @router.post("/api/webhooks/africastalking/sms-status")
    async def delivery_report(request: Request) -> Response:
        expected = str(_setting(settings, "webhook_token"))
        if not _token_valid(request, settings):
            status = 503 if len(expected.encode("utf-8")) < 32 else 401
            return JSONResponse({"error": "Callback authentication is not configured." if status == 503 else "Unauthorized callback."}, status_code=status)
        try:
            data = await _read_form(request, _REPORT_FIELDS, {"id": 120, "messageId": 120, "status": 40, "phoneNumber": 16, "networkCode": 32, "failureReason": 80, "failureCode": 32, "retryCount": 8})
            if data.get("id") and data.get("messageId"):
                raise _FormError("Malformed callback.")
            provider_id = data.get("id") or data.get("messageId")
            status_text = _report_status(_required(data, "status"))
            if not provider_id or not _PROVIDER_ID.fullmatch(provider_id) or status_text is None:
                return JSONResponse({"error": "Malformed delivery report.", "code": "INVALID_CALLBACK"}, status_code=400)
            phone_input = data.get("phoneNumber")
            phone = normalize_kenyan_phone(phone_input) if phone_input else None
            if phone_input and (phone is None or not _allowed_phone(phone, settings)):
                return JSONResponse({"error": "Recipient not allowed.", "code": "PHONE_NOT_ALLOWED"}, status_code=403)
            await run_in_threadpool(
                _db_execute,
                pool,
                "UPDATE sms_messages SET delivery_status = %s, updated_at = %s WHERE provider_message_id = %s",
                (status_text, clock(), provider_id),
            )
            return PlainTextResponse("OK", status_code=200)
        except _FormError as exc:
            return JSONResponse({"error": str(exc), "code": "UNSUPPORTED_CALLBACK_TYPE" if exc.status_code == 415 else "INVALID_CALLBACK"}, status_code=exc.status_code)
        except Exception:
            logger.exception("Africa's Talking delivery report could not be persisted")
            return JSONResponse({"error": "Callback could not be processed.", "code": "CALLBACK_ERROR"}, status_code=500)

    return router
