"""Exercise the local authenticated telecom callbacks without exposing secrets."""

from __future__ import annotations

import asyncio
import sys
import uuid
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from safaridesk.config import settings  # noqa: E402


async def main() -> None:
    async with httpx.AsyncClient(timeout=10) as client:
        health = await client.get("http://127.0.0.1:3001/health")
        body = health.json()
        print(
            f"local_health={health.status_code}; postgresql={body.get('database')}; "
            f"mock_data={body.get('mockData')}"
        )

        ussd_url = "http://127.0.0.1:3001/api/webhooks/africastalking/ussd"
        data = {
            "sessionId": "local-verify-" + uuid.uuid4().hex,
            "serviceCode": settings.at_ussd_service_code,
            "phoneNumber": settings.at_test_phone,
            "text": "",
        }
        first = await client.post(ussd_url, params={"token": settings.webhook_token}, data=data)
        print(f"local_ussd_initial={first.status_code}; response_starts_con={first.text.startswith('CON ')}")
        data["text"] = "1"
        destinations = await client.post(ussd_url, params={"token": settings.webhook_token}, data=data)
        print(
            f"local_ussd_destinations={destinations.status_code}; "
            f"contains_mara={'Maasai Mara' in destinations.text}"
        )
        data["text"] = "1*1"
        detail = await client.post(ussd_url, params={"token": settings.webhook_token}, data=data)
        print(f"local_ussd_detail={detail.status_code}; response_starts_end={detail.text.startswith('END ')}")

        missing = await client.post(ussd_url, data={"sessionId": "no-auth-test"})
        print(f"local_ussd_without_token={missing.status_code}")

        dlr_url = "http://127.0.0.1:3001/api/webhooks/africastalking/sms-status"
        header_only = await client.post(dlr_url, headers={"x-webhook-token": settings.webhook_token})
        print(f"local_dlr_header_only={header_only.status_code}")
        valid = await client.post(
            dlr_url,
            params={"token": settings.webhook_token},
            data={"id": "nonexistent-local-test-id", "status": "Sent"},
        )
        print(f"local_dlr_with_query_token={valid.status_code}")

        assert health.status_code == 200
        assert body.get("database") == "postgresql" and body.get("mockData") is False
        assert first.status_code == destinations.status_code == detail.status_code == 200
        assert first.text.startswith("CON ")
        assert destinations.text.startswith("CON ") and "Maasai Mara" in destinations.text
        assert detail.text.startswith("END ") and "Great Migration" in detail.text
        assert missing.status_code == header_only.status_code == 401
        assert valid.status_code == 200


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        print(f"Local callback smoke test failed: {type(exc).__name__}")
        raise SystemExit(1) from None
