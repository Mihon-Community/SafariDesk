import hashlib
import hmac
import json

import httpx

from safaridesk.paystack import create_mpesa_offline_charge, verify_webhook_signature


def test_mpesa_offline_charge_uses_kes_minor_units_and_validates_paybill_response():
    seen = {}

    def provider(request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={
            "status": True,
            "data": {
                "reference": "SDUSSD-12-ABCDEF1234567890",
                "status": "pay_offline",
                "display_text": "Pay using M-Pesa",
                "account_number": "4084333",
                "account_reference": 1234567,
            },
        })

    result = create_mpesa_offline_charge(
        "sk_test_example",
        email="guest@example.com",
        amount_kes=1500,
        reference="SDUSSD-12-ABCDEF1234567890",
        transport=httpx.MockTransport(provider),
    )
    assert result == {
        "accepted": True,
        "reference": "SDUSSD-12-ABCDEF1234567890",
        "accountNumber": "4084333",
        "accountReference": "1234567",
        "displayText": "Pay using M-Pesa",
    }
    assert seen["url"] == "https://api.paystack.co/charge"
    assert seen["auth"] == "Bearer sk_test_example"
    assert seen["body"] == {
        "amount": 150000,
        "email": "guest@example.com",
        "currency": "KES",
        "reference": "SDUSSD-12-ABCDEF1234567890",
        "mobile_money": {"provider": "mpesa_offline"},
    }


def test_webhook_signatures_support_current_signing_secret_and_reject_replays():
    body = b'{"event":"charge.success"}'
    secret = "whsec_test_signing_secret"
    timestamp = 1_800_000_000
    signature = hmac.new(secret.encode(), str(timestamp).encode() + b"." + body, hashlib.sha512).hexdigest()
    headers = {"paystack-signature": f"t={timestamp},v1=whk_key:{signature}"}

    assert verify_webhook_signature(body, headers, secret_key="", webhook_secret=secret, now=timestamp)
    assert not verify_webhook_signature(body, headers, secret_key="", webhook_secret=secret, now=timestamp + 301)
    assert not verify_webhook_signature(body, {
        "paystack-signature": f"t={timestamp},t={timestamp},v1=whk_key:{signature}"
    }, secret_key="", webhook_secret=secret, now=timestamp)
