"""Confirm public telecom callback paths require credentials without sending any."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from safaridesk.config import settings  # noqa: E402


async def main() -> None:
    if not settings.public_base_url.startswith("https://"):
        raise RuntimeError("PUBLIC_BASE_URL must be configured as HTTPS")
    async with httpx.AsyncClient(timeout=20) as client:
        for path in (
            "/api/webhooks/africastalking/ussd",
            "/api/webhooks/africastalking/sms-status",
        ):
            response = await client.post(settings.public_base_url + path)
            print(f"{path}: unauthenticated_status={response.status_code}")
            assert response.status_code == 401


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        print(f"Public route protection check failed: {type(exc).__name__}")
        raise SystemExit(1) from None
