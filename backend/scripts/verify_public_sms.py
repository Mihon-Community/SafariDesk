"""Exercise SMS destination browsing through the public ngrok callback.

This sends the webhook token and configured test number through ngrok, then
asks Africa's Talking Sandbox to send two SMS replies to that test number.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import hmac
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from safaridesk.config import settings  # noqa: E402
from safaridesk.db import create_pool  # noqa: E402


def _normalized_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if digits.startswith("0"):
        digits = "254" + digits[1:]
    return "+" + digits if digits.startswith("254") and len(digits) == 12 else ""


def _phone_hash(phone: str) -> str:
    secret = settings.webhook_token or settings.at_api_key
    return hmac.new(secret.encode("utf-8"), phone.encode("utf-8"), hashlib.sha256).hexdigest()


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--confirm-secrets-through-ngrok",
        action="store_true",
        help="Confirm this test may send WEBHOOK_TOKEN and AT_TEST_PHONE through ngrok and send two Sandbox SMS replies.",
    )
    args = parser.parse_args()
    if not args.confirm_secrets_through_ngrok:
        raise SystemExit("Pass --confirm-secrets-through-ngrok only when this Sandbox test is approved.")

    parsed = urlsplit(settings.public_base_url)
    hostname = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not hostname.endswith((".ngrok-free.dev", ".ngrok.app", ".ngrok.io")):
        raise SystemExit("PUBLIC_BASE_URL must be the active HTTPS ngrok origin.")
    if settings.at_username.lower() != "sandbox":
        raise SystemExit("This verifier only sends through the Africa's Talking Sandbox.")
    if not settings.database_url or not settings.at_api_key or not settings.webhook_token:
        raise SystemExit("DATABASE_URL, AT_API_KEY, and WEBHOOK_TOKEN must be set in backend/.env.")

    phone = _normalized_phone(settings.at_test_phone)
    if not phone:
        raise SystemExit("AT_TEST_PHONE must be a valid Kenyan mobile number.")
    if not settings.at_allowed_phones or phone not in settings.at_allowed_phones:
        raise SystemExit("AT_TEST_PHONE must be explicitly included in AT_ALLOWED_PHONES for this test.")

    pool = create_pool(settings)
    pool.open()
    started_at = datetime.now(timezone.utc)
    try:
        phone_hash = _phone_hash(phone)
        with pool.connection() as conn:
            opted_out = conn.execute(
                "SELECT 1 FROM sms_opt_outs WHERE phone_hash = %s",
                (phone_hash,),
            ).fetchone()
        if opted_out:
            raise SystemExit("The configured test number opted out. Send START in the Sandbox simulator before testing PARKS.")

        callback_url = f"{settings.public_base_url}/webhook/incoming"
        message_group = "safaridesk-sms-verify-" + uuid.uuid4().hex
        results: list[tuple[str, int, bool]] = []
        try:
            async with httpx.AsyncClient(timeout=25, follow_redirects=False) as client:
                for suffix, command in (("parks", "PARKS"), ("detail", "1")):
                    response = await client.post(
                        callback_url,
                        params={"token": settings.webhook_token},
                        data={
                            "id": f"{message_group}-{suffix}",
                            "from": settings.at_test_phone,
                            "text": command,
                        },
                    )
                    results.append((command, response.status_code, response.status_code == 200 and response.text.strip() == "OK"))
        except Exception as exc:
            print(f"public_sms_callback_failed={type(exc).__name__}")
            raise SystemExit(1) from None

        with pool.connection() as conn:
            rows = conn.execute(
                """SELECT event_kind, api_status_code FROM sms_messages
                   WHERE recipient_hash = %s AND created_at >= %s
                     AND event_kind IN ('PARKS', 'DESTINATION')
                   ORDER BY created_at""",
                (phone_hash, started_at),
            ).fetchall()

        persisted = {str(row[0]): row[1] for row in rows}
        callback_ok = len(results) == 2 and all(ok for _, _, ok in results)
        for command, status, ok in results:
            print(f"public_sms_{command.lower()}_callback={status}; accepted={ok}")

        list_code = persisted.get("PARKS")
        detail_code = persisted.get("DESTINATION")
        list_accepted = list_code in {100, 101, 102}
        detail_accepted = detail_code in {100, 101, 102}
        print(f"sandbox_sms_parks_reply_accepted={list_accepted}; provider_code={list_code or 'not recorded'}")
        print(f"sandbox_sms_detail_reply_accepted={detail_accepted}; provider_code={detail_code or 'not recorded'}")

        if not callback_ok or not list_accepted or not detail_accepted:
            raise SystemExit(1)
    finally:
        pool.close()


if __name__ == "__main__":
    asyncio.run(main())
