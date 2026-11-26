"""Send one authenticated USSD menu round-trip through the public ngrok URL.

This sends WEBHOOK_TOKEN in the query string and AT_TEST_PHONE in the request
body through ngrok. Run only when that public transfer is approved.
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
import uuid
from pathlib import Path
from urllib.parse import urlsplit

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from safaridesk.config import settings  # noqa: E402


def _normalized_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if digits.startswith("0"):
        digits = "254" + digits[1:]
    return "+" + digits if digits.startswith("254") and len(digits) == 12 else ""


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--confirm-secrets-through-ngrok",
        action="store_true",
        help="Confirm this one test may send WEBHOOK_TOKEN and AT_TEST_PHONE through ngrok.",
    )
    args = parser.parse_args()
    if not args.confirm_secrets_through_ngrok:
        raise SystemExit("Pass --confirm-secrets-through-ngrok only when the transfer is approved.")

    parsed = urlsplit(settings.public_base_url)
    hostname = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not hostname.endswith(
        (".ngrok-free.dev", ".ngrok.app", ".ngrok.io")
    ):
        raise SystemExit("PUBLIC_BASE_URL must be the active HTTPS ngrok origin.")
    if not settings.webhook_token or not settings.at_test_phone or not settings.at_ussd_service_code:
        raise SystemExit("WEBHOOK_TOKEN, AT_TEST_PHONE, and AT_USSD_SERVICE_CODE must be set in backend/.env.")

    normalized_phone = _normalized_phone(settings.at_test_phone)
    if not normalized_phone:
        raise SystemExit("AT_TEST_PHONE must be a valid Kenyan mobile number.")
    if settings.at_allowed_phones and normalized_phone not in settings.at_allowed_phones:
        raise SystemExit("AT_TEST_PHONE is not included in AT_ALLOWED_PHONES.")

    callback_url = f"{settings.public_base_url}/api/webhooks/africastalking/ussd"
    data = {
        "sessionId": "public-verify-" + uuid.uuid4().hex,
        "serviceCode": settings.at_ussd_service_code,
        "phoneNumber": settings.at_test_phone,
        "text": "",
    }

    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
            initial = await client.post(
                callback_url,
                params={"token": settings.webhook_token},
                data=data,
            )
            initial_is_con = initial.status_code == 200 and initial.text.startswith("CON ")
            print(f"public_ussd_initial={initial.status_code}; response_is_con={initial_is_con}")

            data["text"] = "1"
            destinations = await client.post(
                callback_url,
                params={"token": settings.webhook_token},
                data=data,
            )
            first_option = next(
                (line.partition(".")[2].strip() for line in destinations.text.splitlines() if re.match(r"^1\.\s+", line)),
                "",
            )
            destinations_ok = (
                destinations.status_code == 200
                and destinations.text.startswith("CON ")
                and bool(first_option)
            )
            print(f"public_ussd_destinations={destinations.status_code}; contains_catalog={destinations_ok}")

            data["text"] = "1*1"
            detail = await client.post(
                callback_url,
                params={"token": settings.webhook_token},
                data=data,
            )
            detail_is_end = (
                detail.status_code == 200
                and detail.text.startswith("END ")
                and bool(first_option)
                and first_option.split()[0] in detail.text
            )
            print(f"public_ussd_destination_detail={detail.status_code}; response_is_end={detail_is_end}")

            delivery_report = await client.post(
                f"{settings.public_base_url}/api/webhooks/africastalking/sms-status",
                params={"token": settings.webhook_token},
                data={"id": "public-verify-" + uuid.uuid4().hex, "status": "Sent"},
            )
            print(f"public_sms_status_callback={delivery_report.status_code}")
    except Exception as exc:
        print(f"public_ussd_request_failed={type(exc).__name__}")
        raise SystemExit(1) from None

    if not initial_is_con or not destinations_ok or not detail_is_end or delivery_report.status_code != 200:
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
