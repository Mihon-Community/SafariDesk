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
from datetime import date, datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Mapping
from urllib.parse import parse_qsl

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from starlette.concurrency import run_in_threadpool

from .paystack import create_mpesa_offline_charge, verify_webhook_signature

logger = logging.getLogger("safaridesk.telecom")

_SMS_OK_CODES = {100, 101, 102}
_USSD_FIELDS = {"sessionId", "serviceCode", "phoneNumber", "text", "networkCode"}
_INBOUND_SMS_FIELDS = {"id", "messageId", "from", "to", "text", "linkId", "date", "networkCode", "retryCount"}
_REPORT_FIELDS = {"id", "messageId", "status", "phoneNumber", "networkCode", "failureReason", "failureCode", "retryCount"}
_PROVIDER_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,120}$")
_USSD_SESSION_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")
_EMAIL = re.compile(r"^[^\s@]{1,64}@[^\s@.]+(?:\.[^\s@.]+)+$")
_SMS_BOOKING_TTL = timedelta(minutes=30)
_EAT = timezone(timedelta(hours=3))

# Public destination guide copy, not sample bookings, inventory, or rates. It
# gives a new installation a useful USSD experience until an operator adds
# their own parks under Rates.
_DESTINATION_HIGHLIGHTS = {
    "maasai mara": ("Maasai Mara Reserve", "Great Migration and Big Five wildlife viewing."),
    "maasai mara national reserve": ("Maasai Mara Reserve", "Great Migration and Big Five wildlife viewing."),
    "amboseli": ("Amboseli National Park", "Elephant herds and views of Mount Kilimanjaro."),
    "amboseli national park": ("Amboseli National Park", "Elephant herds and views of Mount Kilimanjaro."),
    "tsavo east": ("Tsavo East National Park", "Red elephants, Galana River and Yatta Plateau."),
    "tsavo east national park": ("Tsavo East National Park", "Red elephants, Galana River and Yatta Plateau."),
    "nairobi national park": ("Nairobi National Park", "Wildlife drives with Nairobi's skyline nearby."),
}
_DEFAULT_DESTINATIONS = [
    {"name": "Maasai Mara Reserve", "highlight": _DESTINATION_HIGHLIGHTS["maasai mara"][1]},
    {"name": "Amboseli", "highlight": _DESTINATION_HIGHLIGHTS["amboseli"][1]},
    {"name": "Tsavo East", "highlight": _DESTINATION_HIGHLIGHTS["tsavo east"][1]},
    {"name": "Nairobi National Park", "highlight": _DESTINATION_HIGHLIGHTS["nairobi national park"][1]},
]


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

    # Preference confirmations and user-requested HELP remain available after
    # STOP. Other service messages stay suppressed until the guest texts START.
    if event_kind.upper() not in {"STOP", "START", "HELP"} and webhook_token:
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


def _destination_catalog(conn: Any) -> list[dict[str, str]]:
    cursor = conn.execute(
        "SELECT id, payload FROM business_records WHERE record_type = %s ORDER BY id LIMIT 12",
        ("parks",),
    )
    destinations: list[dict[str, str]] = []
    for row in cursor.fetchall():
        payload = _row_json(_row_value(row, "payload", 1))
        raw_name = str(payload.get("name") or "")
        name = re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f\x7f]", " ", raw_name)).strip()
        if not name:
            continue
        known = _DESTINATION_HIGHLIGHTS.get(name.casefold())
        destinations.append({
            "name": known[0] if known else name,
            "highlight": known[1] if known else "Ask SafariDesk about this destination's current safari options.",
            "parkId": str(_row_value(row, "id", 0) or ""),
        })
    return destinations or list(_DEFAULT_DESTINATIONS)


def _load_destination_catalog(pool: Any) -> list[dict[str, str]]:
    with pool.connection() as conn:
        return _destination_catalog(conn)


def _business_records(pool: Any, record_type: str) -> list[dict[str, Any]]:
    with pool.connection() as conn:
        rows = conn.execute(
            "SELECT id, payload, created_at FROM business_records WHERE record_type = %s ORDER BY id",
            (record_type,),
        ).fetchall()
    records = []
    for row in rows:
        payload = _row_json(_row_value(row, "payload", 1))
        record_id = _row_value(row, "id", 0)
        if record_id is not None:
            records.append({**payload, "id": int(record_id)})
    return records


def _get_business_record(pool: Any, record_type: str, record_id: int) -> dict[str, Any] | None:
    with pool.connection() as conn:
        row = _fetchone(conn.execute(
            "SELECT id, payload, created_at FROM business_records WHERE record_type = %s AND id = %s",
            (record_type, record_id),
        ))
    payload = _row_json(_row_value(row, "payload", 1))
    found_id = _row_value(row, "id", 0)
    return {**payload, "id": int(found_id)} if found_id is not None else None


def _insert_business_record(pool: Any, record_type: str, payload: Mapping[str, Any]) -> int:
    with pool.connection() as conn:
        row = _fetchone(conn.execute(
            "INSERT INTO business_records (record_type, payload) VALUES (%s, %s::jsonb) RETURNING id",
            (record_type, json.dumps(dict(payload), separators=(",", ":"))),
        ))
    record_id = _row_value(row, "id", 0)
    if record_id is None:
        raise RuntimeError("PostgreSQL did not return a business record id")
    return int(record_id)


def _update_business_record(pool: Any, record_type: str, record_id: int, payload: Mapping[str, Any]) -> None:
    with pool.connection() as conn:
        row = _fetchone(conn.execute(
            "UPDATE business_records SET payload = %s::jsonb, updated_at = now() WHERE record_type = %s AND id = %s RETURNING id",
            (json.dumps(dict(payload), separators=(",", ":")), record_type, record_id),
        ))
    if row is None:
        raise RuntimeError("PostgreSQL did not update the business record")


def _stored_payload(record: Mapping[str, Any]) -> dict[str, Any]:
    """Strip the database identity before persisting the JSON payload again."""
    return {key: value for key, value in record.items() if key != "id"}


def _sms_session_get(pool: Any, phone_hash: str, now: datetime) -> dict[str, Any] | None:
    with pool.connection() as conn:
        conn.execute("DELETE FROM sms_booking_sessions WHERE expires_at <= %s", (now,))
        row = _fetchone(conn.execute(
            "SELECT state, expires_at FROM sms_booking_sessions WHERE phone_hash = %s",
            (phone_hash,),
        ))
    if row is None:
        return None
    state = _row_json(_row_value(row, "state", 0))
    expires_at = _row_value(row, "expires_at", 1)
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except ValueError:
            return None
    if isinstance(expires_at, datetime) and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return state if isinstance(expires_at, datetime) and expires_at > now else None


def _sms_session_save(pool: Any, phone_hash: str, state: Mapping[str, Any], now: datetime) -> None:
    with pool.connection() as conn:
        conn.execute(
            """INSERT INTO sms_booking_sessions (phone_hash, state, expires_at, updated_at)
               VALUES (%s, %s::jsonb, %s, %s)
               ON CONFLICT (phone_hash) DO UPDATE SET
                 state = EXCLUDED.state, expires_at = EXCLUDED.expires_at,
                 updated_at = EXCLUDED.updated_at""",
            (phone_hash, json.dumps(dict(state), separators=(",", ":")), now + _SMS_BOOKING_TTL, now),
        )


def _sms_session_clear(pool: Any, phone_hash: str) -> None:
    with pool.connection() as conn:
        conn.execute("DELETE FROM sms_booking_sessions WHERE phone_hash = %s", (phone_hash,))


def _valid_start_date(value: str) -> str | None:
    try:
        parsed = date.fromisoformat(value.strip())
    except ValueError:
        return None
    today = datetime.now(timezone.utc).astimezone(_EAT).date()
    return parsed.isoformat() if parsed >= today else None


def _create_booking_request(
    pool: Any,
    *,
    phone: str,
    destination: Mapping[str, Any],
    start_date: str,
    pax: int,
    trip_days: int,
    pickup_location: str,
    guest_name: str,
    email: str,
    residency: str,
    source: str,
) -> int:
    guest = next((item for item in _business_records(pool, "guests") if item.get("phone") == phone), None)
    guest_payload = {
        **({key: value for key, value in guest.items() if key not in {"id", "createdAt"}} if guest else {}),
        "name": guest_name,
        "phone": phone,
        "email": email,
        "residency": residency,
        "loyaltyPoints": int((guest or {}).get("loyaltyPoints") or 0),
        "referralCode": (guest or {}).get("referralCode"),
    }
    guest_id = int(guest["id"]) if guest else _insert_business_record(pool, "guests", guest_payload)
    if guest:
        _update_business_record(pool, "guests", guest_id, guest_payload)

    starts = date.fromisoformat(start_date)
    ends = starts + timedelta(days=trip_days - 1)
    try:
        park_id = int(destination.get("parkId") or 0) or None
    except (TypeError, ValueError):
        park_id = None
    now = datetime.now(timezone.utc).isoformat()
    return _insert_business_record(pool, "bookings", {
        "guestId": guest_id,
        "packageId": None,
        "parkId": park_id,
        "destinationName": str(destination.get("name") or "")[:80],
        "startDate": starts.isoformat(),
        "endDate": ends.isoformat(),
        "tripDays": trip_days,
        "pax": pax,
        "pickupLocation": pickup_location[:100],
        "total": 0,
        "depositDue": 0,
        "quoteBreakdown": None,
        "quoteStatus": "REQUESTED",
        "quoteRequestedAt": now,
        "status": "PENDING",
        "source": source,
        "createdBy": None,
    })


def _paystack_offline_message(
    pool: Any,
    settings: Any,
    booking_id: int,
    phone: str,
    charger: Callable[..., Mapping[str, Any]] = create_mpesa_offline_charge,
) -> str:
    booking = _get_business_record(pool, "bookings", booking_id)
    if not booking:
        return "END Booking not found. Check the booking number and dial again."
    amount = int(booking.get("depositDue") or 0)
    if booking.get("quoteStatus") != "QUOTED" or amount < 3:
        return f"END Booking #{booking_id} needs an operator quote before payment."
    guest = _get_business_record(pool, "guests", int(booking.get("guestId") or 0))
    if not guest or normalize_kenyan_phone(str(guest.get("phone") or "")) != phone:
        return "END This booking is not linked to your phone number. Contact SafariDesk for help."
    email = str((guest or {}).get("email") or "").strip()
    if not email or not _EMAIL.fullmatch(email):
        return f"END Booking #{booking_id} needs a guest email before payment. Ask the operator to update it."
    secret_key = str(_setting(settings, "paystack_secret_key")).strip()
    if not secret_key:
        return "END M-Pesa payments are not configured yet. Contact SafariDesk."

    payments = _business_records(pool, "payments")
    for payment in payments:
        if (
            str(payment.get("bookingId")) == str(booking_id)
            and payment.get("provider") == "paystack"
            and payment.get("status") == "PENDING"
        ):
            account_number = str(payment.get("accountNumber") or "")
            account_reference = str(payment.get("accountReference") or "")
            if account_number and account_reference:
                return (
                    f"END Paybill {account_number}; account {account_reference}; KES {amount}. "
                    "Pay in M-Pesa: Lipa na M-Pesa > Paybill."
                )
            return "END Payment request is still processing. Please try again shortly."

    reference = f"SDUSSD-{booking_id}-{uuid.uuid4().hex[:16].upper()}"
    payment_id = _insert_business_record(pool, "payments", {
        "bookingId": booking_id,
        "phone": str((guest or {}).get("phone") or ""),
        "providerRef": reference,
        "mpesaRef": None,
        "amount": amount,
        "currency": "KES",
        "method": "M-PESA",
        "provider": "paystack",
        "status": "PENDING",
        "channel": "ussd",
        "accountNumber": None,
        "accountReference": None,
        "createdBy": None,
    })
    try:
        outcome = charger(
            secret_key,
            email=email,
            amount_kes=amount,
            reference=reference,
        )
    except Exception as exc:
        outcome = {"accepted": False, "reason": type(exc).__name__}

    if not isinstance(outcome, Mapping) or not outcome.get("accepted"):
        failed = _get_business_record(pool, "payments", payment_id) or {}
        _update_business_record(pool, "payments", payment_id, {
            **_stored_payload(failed),
            "status": "FAILED",
            "providerReason": str(outcome.get("reason") if isinstance(outcome, Mapping) else "provider_error")[:40],
        })
        return "END Could not start M-Pesa payment. Try again later or contact SafariDesk."

    provider_reference = str(outcome.get("reference") or reference)
    created = _get_business_record(pool, "payments", payment_id) or {}
    _update_business_record(pool, "payments", payment_id, {
        **_stored_payload(created),
        "providerRef": provider_reference,
        "accountNumber": str(outcome["accountNumber"]),
        "accountReference": str(outcome["accountReference"]),
        "status": "PENDING",
    })
    return (
        f"END Paybill {outcome['accountNumber']}; account {outcome['accountReference']}; KES {amount}. "
        "Pay in M-Pesa: Lipa na M-Pesa > Paybill."
    )


def _destination_menu(destinations: list[dict[str, str]], page: int) -> str:
    start = page * 3
    items = destinations[start:start + 3]
    if not items and page > 0:
        return "END No more destinations. Dial again to restart."
    lines = ["CON Safari destinations"]
    lines.extend(f"{index}. {item['name'][:24]}" for index, item in enumerate(items, 1))
    if start + len(items) < len(destinations):
        lines.append("9. More destinations")
    lines.append("0. Back")
    return "\n".join(lines)


def _ussd_booking_response(
    text: str,
    destinations: list[dict[str, str]],
    pool: Any,
    phone: str,
) -> str:
    segments = text.split("*")
    if not segments or segments[0] != "2":
        return "END Invalid booking selection. Dial again to restart."
    page = 0
    selection_position = 1
    while selection_position < len(segments) and segments[selection_position] == "9":
        page += 1
        selection_position += 1
    if selection_position >= len(segments):
        menu = _destination_menu(destinations, page)
        return menu.replace("CON Safari destinations", "CON Choose safari destination", 1)
    selected = segments[selection_position]
    if selected == "0" and selection_position == 1:
        return "CON SafariDesk\n1. Safari destinations\n2. Request booking\n3. Pay a deposit\n4. Booking help\n0. Exit"
    if not re.fullmatch(r"[1-3]", selected):
        return "END Invalid destination. Dial again and choose a listed number."
    destination_index = page * 3 + int(selected) - 1
    if destination_index >= len(destinations):
        return "END That destination is unavailable. Dial again and choose another."
    destination = destinations[destination_index]
    fields = segments[selection_position + 1:]
    prompts = [
        "Enter travel start date as YYYY-MM-DD.",
        "How many guests? Enter 1 to 50.",
        "How many trip days? Enter 1 to 30.",
        "Enter pickup location (town, hotel or airport).",
        "Enter lead guest full name.",
        "Enter guest email for the quote and receipt.",
        "Residency: 1 Citizen, 2 Resident, 3 Non-resident.",
    ]
    if not fields:
        return f"CON {prompts[0]}"

    start_date = _valid_start_date(fields[0])
    if not start_date:
        return "END Invalid date. Dial again and enter a future YYYY-MM-DD date."
    if len(fields) == 1:
        return f"CON {prompts[1]}"
    if not fields[1].isdigit() or not 1 <= int(fields[1]) <= 50:
        return "END Guest count must be 1 to 50. Dial again to restart."
    if len(fields) == 2:
        return f"CON {prompts[2]}"
    if not fields[2].isdigit() or not 1 <= int(fields[2]) <= 30:
        return "END Trip length must be 1 to 30 days. Dial again to restart."
    if len(fields) == 3:
        return f"CON {prompts[3]}"
    pickup = re.sub(r"[\x00-\x1f\x7f]", " ", fields[3]).strip()
    if not 2 <= len(pickup) <= 100:
        return "END Pickup location must be 2 to 100 characters. Dial again to restart."
    if len(fields) == 4:
        return f"CON {prompts[4]}"
    guest_name = re.sub(r"[\x00-\x1f\x7f]", " ", fields[4]).strip()
    if not 2 <= len(guest_name) <= 80:
        return "END Guest name must be 2 to 80 characters. Dial again to restart."
    if len(fields) == 5:
        return f"CON {prompts[5]}"
    email = fields[5].strip().casefold()
    if len(email) > 254 or not _EMAIL.fullmatch(email):
        return "END Invalid email. Dial again and enter a valid email address."
    if len(fields) == 6:
        return f"CON {prompts[6]}"
    residency = {"1": "citizen", "2": "resident", "3": "non_resident"}.get(fields[6])
    if residency is None:
        return "END Choose residency 1, 2 or 3. Dial again to restart."
    if len(fields) == 7:
        return (
            f"CON {destination['name']}, {fields[1]} guests, {fields[2]} days, "
            f"{start_date}, pickup {pickup[:28]}. Reply 1 to submit or 0 to cancel."
        )
    if len(fields) != 8 or fields[7] not in {"0", "1"}:
        return "END Invalid confirmation. Dial again to restart."
    if fields[7] == "0":
        return "END Booking request cancelled. Thank you."

    booking_id = _create_booking_request(
        pool,
        phone=phone,
        destination=destination,
        start_date=start_date,
        pax=int(fields[1]),
        trip_days=int(fields[2]),
        pickup_location=pickup,
        guest_name=guest_name,
        email=email,
        residency=residency,
        source="ussd",
    )
    return f"END Booking request #{booking_id} saved. An operator will confirm price and availability. Dial again to pay after the quote."


def _menu_response(
    text: str,
    destinations: list[dict[str, str]],
    *,
    pool: Any,
    settings: Any,
    phone: str,
    paystack_charger: Callable[..., Mapping[str, Any]],
) -> str:
    if text == "":
        return "CON SafariDesk\n1. Safari destinations\n2. Request booking\n3. Pay a deposit\n4. Booking help\n0. Exit"
    selections = text.split("*")
    if text == "0":
        return "END Thank you for using SafariDesk."
    if selections[0] == "2":
        return _ussd_booking_response(text, destinations, pool, phone)
    if selections[0] == "3":
        if len(selections) == 1:
            return "CON Enter your booking number to pay its quoted deposit."
        if len(selections) != 2 or not selections[1].isdigit() or int(selections[1]) < 1:
            return "END Invalid booking number. Dial again to restart."
        return _paystack_offline_message(pool, settings, int(selections[1]), phone, paystack_charger)
    if selections[0] == "4" and len(selections) == 1:
        return "END For booking help, text HELP or contact SafariDesk. Ask the operator to confirm dates, availability and current rates."
    if len(selections) > 5 or any(not re.fullmatch(r"\d{1,2}", item) for item in selections):
        return "END Invalid selection. Dial again to restart."
    if selections[0] != "1":
        return "END Invalid selection. Dial again to restart."

    tail = selections[1:]
    if not tail:
        return _destination_menu(destinations, page=0)
    if tail == ["0"]:
        return "CON SafariDesk\n1. Safari destinations\n2. Booking help\n0. Exit"

    page = 0
    while tail and tail[0] == "9":
        page += 1
        tail = tail[1:]
    if not tail:
        return _destination_menu(destinations, page)
    if tail == ["0"]:
        return "CON SafariDesk\n1. Safari destinations\n2. Booking help\n0. Exit" if page == 0 else _destination_menu(destinations, page - 1)
    if len(tail) != 1:
        return "END Invalid selection. Dial again to restart."
    index = page * 3 + int(tail[0]) - 1
    if index < page * 3 or index >= len(destinations) or index >= (page + 1) * 3:
        return "END That destination is not available. Dial again to restart."
    destination = destinations[index]
    name = destination["name"][:32]
    return f"END {name}: {destination['highlight']} Ask SafariDesk about dates, availability and rates."


def _process_ussd(
    pool: Any,
    session_id: str,
    phone_hash: str,
    service_code: str,
    text: str,
    now: datetime,
    ttl_seconds: int,
    settings: Any,
    phone: str,
    paystack_charger: Callable[..., Mapping[str, Any]],
) -> str:
    with pool.connection() as conn:
        destinations = _destination_catalog(conn)
        row = _fetchone(conn.execute(
            "SELECT phone_hash, service_code, state, expires_at FROM ussd_sessions WHERE session_id = %s",
            (session_id,),
        ))
    # Payment handling opens its own database connections and calls Paystack.
    # Release the session lookup connection first so callbacks cannot exhaust
    # a small pool while waiting for the provider.
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

    if row is not None and expires_at and expires_at > now:
        if old_phone_hash != phone_hash or old_service != service_code:
            return "END Invalid session. Dial again to restart."
        if state.get("input_text") == text:
            response_text = str(state.get("response_text") or _menu_response(
                text, destinations, pool=pool, settings=settings, phone=phone,
                paystack_charger=paystack_charger,
            ))
        else:
            response_text = _menu_response(
                text, destinations, pool=pool, settings=settings, phone=phone,
                paystack_charger=paystack_charger,
            )
    elif row is not None and text:
        response_text = "END Session expired. Dial again to restart."
    else:
        response_text = _menu_response(
            text, destinations, pool=pool, settings=settings, phone=phone,
            paystack_charger=paystack_charger,
        )

    with pool.connection() as conn:
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


def _sms_destination_key(value: str) -> str:
    words = re.findall(r"[a-z0-9]+", value.casefold())
    while words and words[-1] in {"national", "park", "reserve"}:
        words.pop()
    return " ".join(words)


def _sms_destination_detail(
    text: str,
    destinations: list[dict[str, str]],
) -> dict[str, str] | None:
    term = text.strip()
    if term.upper().startswith("PARK "):
        term = term[5:].strip()
    if term.isdigit():
        index = int(term)
        return destinations[index - 1] if 1 <= index <= len(destinations) else None

    key = _sms_destination_key(term)
    if key == "mara":
        key = "maasai mara"
    elif key == "tsavo":
        key = "tsavo east"
    if not key:
        return None
    for destination in destinations:
        destination_key = _sms_destination_key(destination["name"])
        if destination_key == key or (key == "tsavo" and destination_key.startswith("tsavo ")):
            return destination
    return None


def _sms_destination_label(name: str) -> str:
    label = re.sub(
        r"\s+(?:National Park|National Reserve|Reserve|Conservancy)$",
        "",
        name,
        flags=re.IGNORECASE,
    )
    return label[:16].strip()


def _sms_booking_prompt(step: str) -> str:
    prompts = {
        "destination": "SafariDesk booking: reply with a park name or number. Text PARKS for the list.",
        "date": "Travel start date? Reply YYYY-MM-DD.",
        "pax": "How many guests? Reply with 1 to 50.",
        "days": "How many trip days? Reply with 1 to 30.",
        "pickup": "Where should the safari pickup be? Reply with a town, hotel or airport.",
        "name": "What is the lead guest's full name?",
        "email": "What email can receive the quote and receipt?",
        "residency": "Lead guest residency: reply 1 Kenyan citizen, 2 Kenyan resident, or 3 non-resident.",
        "confirm": "Reply YES to submit this booking request or NO to discard it.",
    }
    return prompts[step]


def _sms_booking_step(
    pool: Any,
    phone: str,
    session: Mapping[str, Any],
    text: str,
    now: datetime,
) -> tuple[str, dict[str, Any] | None, int | None]:
    step = str(session.get("step") or "destination")
    data = dict(session.get("data") or {})
    value = re.sub(r"[\x00-\x1f\x7f]", " ", text).strip()

    if step == "destination":
        destination = _sms_destination_detail(value, data.get("catalog") or []) if data.get("catalog") else None
        if destination is None:
            return "Reply with a park name or number from PARKS.", dict(session), None
        data["destination"] = {key: destination.get(key) for key in ("name", "parkId", "highlight")}
        next_step = "date"
    elif step == "date":
        parsed = _valid_start_date(value)
        if not parsed:
            return "Use a future date in YYYY-MM-DD format.", dict(session), None
        data["startDate"] = parsed
        next_step = "pax"
    elif step == "pax":
        if not value.isdigit() or not 1 <= int(value) <= 50:
            return "Guest count must be a number from 1 to 50.", dict(session), None
        data["pax"] = int(value)
        next_step = "days"
    elif step == "days":
        if not value.isdigit() or not 1 <= int(value) <= 30:
            return "Trip length must be a number from 1 to 30 days.", dict(session), None
        data["tripDays"] = int(value)
        next_step = "pickup"
    elif step == "pickup":
        if not 2 <= len(value) <= 100:
            return "Enter a pickup location between 2 and 100 characters.", dict(session), None
        data["pickupLocation"] = value
        next_step = "name"
    elif step == "name":
        if not 2 <= len(value) <= 80:
            return "Enter the lead guest's name (2 to 80 characters).", dict(session), None
        data["guestName"] = value
        next_step = "email"
    elif step == "email":
        email = value.casefold()
        if len(email) > 254 or not _EMAIL.fullmatch(email):
            return "Enter a valid email address for the quote and receipt.", dict(session), None
        data["email"] = email
        next_step = "residency"
    elif step == "residency":
        residency = {
            "1": "citizen", "CITIZEN": "citizen", "KENYAN CITIZEN": "citizen",
            "2": "resident", "RESIDENT": "resident", "KENYAN RESIDENT": "resident",
            "3": "non_resident", "NON-RESIDENT": "non_resident", "NON RESIDENT": "non_resident",
        }.get(value.upper())
        if residency is None:
            return _sms_booking_prompt("residency"), dict(session), None
        data["residency"] = residency
        next_step = "confirm"
    elif step == "confirm":
        if value.upper() in {"NO", "N"}:
            return "Booking request discarded. Text BOOK to start again.", None, None
        if value.upper() not in {"YES", "Y"}:
            return _sms_booking_prompt("confirm"), dict(session), None
        booking_id = _create_booking_request(
            pool,
            phone=phone,
            destination=data["destination"],
            start_date=data["startDate"],
            pax=int(data["pax"]),
            trip_days=int(data["tripDays"]),
            pickup_location=str(data["pickupLocation"]),
            guest_name=str(data["guestName"]),
            email=str(data["email"]),
            residency=str(data["residency"]),
            source="sms",
        )
        return (
            f"Booking request #{booking_id} saved for {data['destination']['name']}. "
            "An operator must confirm rates and availability. After the quote, dial SafariDesk USSD and choose Pay deposit.",
            None,
            booking_id,
        )
    else:
        return "Booking request expired. Text BOOK to start again.", None, None

    updated = {"step": next_step, "data": data}
    return _sms_booking_prompt(next_step), updated, None


def _classify_sms(
    text: str,
    public_app_url: str,
    destinations: list[dict[str, str]] | None = None,
) -> tuple[str, str, str | None]:
    command_text = re.sub(r"\s+", " ", text.strip().upper())
    catalog = destinations or list(_DEFAULT_DESTINATIONS)
    if command_text in {"STOP", "UNSUBSCRIBE", "CANCEL", "QUIT", "END"}:
        return "STOP", "SafariDesk SMS updates are stopped. Text START to re-enable service messages.", "stop"
    if command_text == "START":
        return "START", "SafariDesk SMS is enabled. Text HELP for options or PARKS to browse destinations.", "start"
    if command_text == "HELP":
        return "HELP", "SafariDesk: Text PARKS for options, a number or park name for details, or BOOK for booking help. STOP opts out; START re-enables.", None
    if command_text == "BOOK":
        app_url = public_app_url.rstrip("/")
        browse = f"or visit {app_url}/parks" if app_url else "or contact your safari operator"
        reply = f"SafariDesk: Text PARKS to browse by SMS {browse}. Your operator confirms dates, availability and current rates."
        return "BOOK", reply, None
    parks_page = re.fullmatch(r"(?:PARKS|PARK)\s+(\d{1,2})", command_text)
    if command_text in {"PARKS", "PARK", "OPTIONS", "DESTINATIONS", "SAFARI"} or parks_page:
        requested_page = int(parks_page.group(1)) if parks_page else 1
        if requested_page < 1:
            return "PARKS", "SafariDesk: Text PARKS to browse destinations.", None
        page = requested_page - 1
        page_size = 4
        start = page * page_size
        items = catalog[start:start + page_size]
        if not items:
            return "PARKS", "SafariDesk: no more destinations on that page. Text PARKS to start again.", None
        labels = [f"{start + offset + 1}. {_sms_destination_label(item['name'])}" for offset, item in enumerate(items)]
        reply = "SafariDesk parks: " + "; ".join(labels) + ". Reply with a number for details."
        if start + len(items) < len(catalog):
            reply += f" Text PARKS {page + 2} for more."
        return "PARKS", reply, None

    destination = _sms_destination_detail(command_text, catalog)
    if destination is not None:
        reply = (
            f"{destination['name']}: {destination['highlight']} "
            "Ask your operator about dates, availability and current rates."
        )
        return "DESTINATION", reply, None

    return "OTHER", "SafariDesk: Text PARKS for destinations, BOOK for booking help, or HELP for commands. Text STOP to opt out.", None


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


def _persist_paystack_success(
    pool: Any,
    reference: str,
    amount_subunits: int,
    currency: str,
    now: datetime,
) -> str:
    with pool.connection() as conn, conn.transaction():
        payment_row = _fetchone(conn.execute(
            """SELECT id, payload, created_at FROM business_records
               WHERE record_type = %s AND payload->>'providerRef' = %s FOR UPDATE""",
            ("payments", reference),
        ))
        payment_id = _row_value(payment_row, "id", 0)
        payment = _row_json(_row_value(payment_row, "payload", 1))
        if payment_id is None or payment.get("provider") != "paystack":
            return "unmatched"
        if payment.get("status") == "SUCCESS":
            return "duplicate"
        if payment.get("status") != "PENDING":
            return "not_pending"
        expected_amount = int(payment.get("amount") or 0) * 100
        if amount_subunits != expected_amount or currency != "KES":
            return "amount_mismatch"

        booking_id = int(payment.get("bookingId") or 0)
        booking_row = _fetchone(conn.execute(
            """SELECT id, payload, created_at FROM business_records
               WHERE record_type = %s AND id = %s FOR UPDATE""",
            ("bookings", booking_id),
        ))
        found_booking_id = _row_value(booking_row, "id", 0)
        booking = _row_json(_row_value(booking_row, "payload", 1))
        if found_booking_id is None or booking.get("status") == "CANCELLED":
            return "booking_missing"

        payment.update({"status": "SUCCESS", "paidAt": now.isoformat(), "channel": "mpesa_offline"})
        booking.update({"status": "DEPOSIT_PAID", "depositPaidAt": now.isoformat()})
        conn.execute(
            "UPDATE business_records SET payload = %s::jsonb, updated_at = %s WHERE record_type = %s AND id = %s",
            (json.dumps(payment, separators=(",", ":")), now, "payments", int(payment_id)),
        )
        conn.execute(
            "UPDATE business_records SET payload = %s::jsonb, updated_at = %s WHERE record_type = %s AND id = %s",
            (json.dumps(booking, separators=(",", ":")), now, "bookings", booking_id),
        )
        return "processed"


def build_telecom_router(
    pool: Any,
    settings: Any,
    *,
    sms_sender: Callable[..., Awaitable[dict[str, Any]]] = send_sms,
    now: Callable[[], datetime] | None = None,
    session_ttl_seconds: int = 300,
    paystack_charger: Callable[..., Mapping[str, Any]] = create_mpesa_offline_charge,
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
            data = await _read_form(request, _USSD_FIELDS, {"sessionId": 128, "serviceCode": 32, "phoneNumber": 16, "text": 480, "networkCode": 32})
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
                settings,
                phone,
                paystack_charger,
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
            destinations = await run_in_threadpool(_load_destination_catalog, pool)
            phone_hash = _phone_hash(phone, settings)
            command_text = re.sub(r"\s+", " ", message.strip().upper())
            existing_session = await run_in_threadpool(_sms_session_get, pool, phone_hash, clock())
            pay_match = re.fullmatch(r"PAY(?:\s+#?(\d{1,18}))?", command_text)
            is_book_start = command_text == "BOOK"
            planned_booking_state: dict[str, Any] | None = None
            booking_id: int | None = None

            if command_text in {"STOP", "UNSUBSCRIBE", "CANCEL", "QUIT", "END"}:
                command, reply, preference = _classify_sms(message, public_app_url, destinations)
            elif command_text == "START":
                command, reply, preference = _classify_sms(message, public_app_url, destinations)
            elif is_book_start:
                command, preference = "BOOKING", None
                planned_booking_state = {"step": "destination", "data": {"catalog": destinations}}
                reply = _sms_booking_prompt("destination")
            elif pay_match:
                command, preference = "PAY_GUIDE", None
                service_code = str(_setting(settings, "at_ussd_service_code")).strip()
                requested_id = int(pay_match.group(1)) if pay_match.group(1) else None
                if not service_code:
                    reply = "SafariDesk USSD payments are unavailable. Contact the operator."
                elif requested_id is None:
                    reply = f"To pay: dial {service_code}, choose 3 Pay a deposit, then enter your booking number."
                else:
                    booking = await run_in_threadpool(_get_business_record, pool, "bookings", requested_id)
                    guest = await run_in_threadpool(
                        _get_business_record,
                        pool,
                        "guests",
                        int((booking or {}).get("guestId") or 0),
                    ) if booking else None
                    if not booking or not guest or normalize_kenyan_phone(str(guest.get("phone") or "")) != phone:
                        reply = "No booking was found for this number. Check the booking number or contact SafariDesk."
                    elif booking.get("quoteStatus") != "QUOTED":
                        reply = f"Booking #{requested_id} is awaiting an operator quote. After it is quoted, dial {service_code}, choose 3, and enter {requested_id}."
                    else:
                        reply = f"To pay booking #{requested_id}, dial {service_code}, choose 3 Pay a deposit, then enter {requested_id}."
            elif command_text in {"HELP", "PARKS", "PARK", "OPTIONS", "DESTINATIONS", "SAFARI"} or re.fullmatch(r"(?:PARKS|PARK)\s+\d{1,2}", command_text):
                command, reply, preference = _classify_sms(message, public_app_url, destinations)
            elif existing_session is not None:
                command, preference = f"BOOKING_{str(existing_session.get('step') or 'STEP').upper()}", None
                reply = ""
            else:
                command, reply, preference = _classify_sms(message, public_app_url, destinations)

            inserted, opted_out = await run_in_threadpool(
                _persist_inbound,
                pool,
                provider_id,
                preference,
                phone_hash,
                command,
            )
            should_reply = preference is not None or command == "HELP" or not opted_out
            if not inserted:
                return PlainTextResponse("OK", status_code=200)

            if not opted_out or preference is not None or command == "HELP":
                if command_text in {"STOP", "UNSUBSCRIBE", "CANCEL", "QUIT", "END", "START"}:
                    await run_in_threadpool(_sms_session_clear, pool, phone_hash)
                elif is_book_start:
                    await run_in_threadpool(_sms_session_save, pool, phone_hash, planned_booking_state or {}, clock())
                elif existing_session is not None and command.startswith("BOOKING_"):
                    reply, next_session, booking_id = await run_in_threadpool(
                        _sms_booking_step, pool, phone, existing_session, message, clock()
                    )
                    if next_session is None:
                        await run_in_threadpool(_sms_session_clear, pool, phone_hash)
                    else:
                        await run_in_threadpool(_sms_session_save, pool, phone_hash, next_session, clock())

                    if booking_id is not None:
                        service_code = str(_setting(settings, "at_ussd_service_code")).strip()
                        if service_code:
                            reply = (
                                f"Booking request #{booking_id} saved. An operator must confirm rates and availability. "
                                f"After the quote, dial {service_code}, choose 3, and enter {booking_id} to pay."
                            )

            if inserted and should_reply and reply:
                try:
                    outgoing_kind = "BOOKING" if command.startswith("BOOKING") else command
                    outcome = await sms_sender(pool, settings, phone, reply, event_kind=outgoing_kind)
                    if not isinstance(outcome, Mapping) or not outcome.get("accepted"):
                        status_code = outcome.get("providerErrorCode") if isinstance(outcome, Mapping) else None
                        reason = outcome.get("reason") if isinstance(outcome, Mapping) else None
                        logger.warning(
                            "Africa's Talking inbound SMS reply was not accepted (command=%s, code=%s, reason=%s)",
                            command,
                            status_code,
                            reason,
                        )
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

    @router.post("/api/webhooks/paystack")
    async def paystack_webhook(request: Request) -> Response:
        secret_key = str(_setting(settings, "paystack_secret_key")).strip()
        webhook_secret = str(_setting(settings, "paystack_webhook_secret")).strip()
        if not secret_key:
            return JSONResponse({"error": "Paystack is not configured."}, status_code=503)
        try:
            raw_body = await request.body()
            if len(raw_body) > 65_536:
                return JSONResponse({"error": "Webhook body too large."}, status_code=413)
            if not verify_webhook_signature(
                raw_body,
                request.headers,
                secret_key=secret_key,
                webhook_secret=webhook_secret,
                now=int(clock().timestamp()),
            ):
                return JSONResponse({"error": "Invalid webhook signature."}, status_code=401)
            try:
                payload = json.loads(raw_body)
            except (ValueError, json.JSONDecodeError):
                return JSONResponse({"error": "Invalid webhook payload."}, status_code=400)
            if not isinstance(payload, dict):
                return JSONResponse({"error": "Invalid webhook payload."}, status_code=400)
            if payload.get("event") != "charge.success":
                return JSONResponse({"received": True}, status_code=200)
            data = payload.get("data")
            if not isinstance(data, dict):
                return JSONResponse({"error": "Invalid charge event."}, status_code=400)
            reference = data.get("reference")
            status = str(data.get("status") or "").lower()
            currency = str(data.get("currency") or "").upper()
            amount = data.get("amount")
            if (
                not isinstance(reference, str)
                or not re.fullmatch(r"[A-Za-z0-9_-]{8,100}", reference)
                or status != "success"
                or isinstance(amount, bool)
                or not isinstance(amount, int)
                or amount < 1
            ):
                return JSONResponse({"error": "Invalid charge event."}, status_code=400)
            result = await run_in_threadpool(
                _persist_paystack_success,
                pool,
                reference,
                amount,
                currency,
                clock(),
            )
            if result == "amount_mismatch":
                logger.warning("Paystack charge success did not match the expected booking amount")
            return JSONResponse({"received": True}, status_code=200)
        except Exception as exc:
            logger.error("Paystack webhook could not be processed (%s)", type(exc).__name__)
            return JSONResponse({"error": "Webhook could not be processed."}, status_code=500)

    return router
