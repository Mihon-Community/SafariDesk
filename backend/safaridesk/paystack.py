"""Small Paystack M-PESA offline-charge client and webhook signature checks."""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import time
from typing import Any

import httpx


def create_mpesa_offline_charge(
    secret_key: str,
    *,
    email: str,
    amount_kes: int,
    reference: str,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    """Create Paystack's Kenyan M-PESA Paybill flow, without logging secrets."""
    if not secret_key:
        return {"accepted": False, "reason": "not_configured"}
    if amount_kes < 3:
        return {"accepted": False, "reason": "amount_below_minimum"}
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,100}", reference):
        return {"accepted": False, "reason": "invalid_reference"}

    try:
        with httpx.Client(transport=transport, timeout=15.0) as client:
            response = client.post(
                "https://api.paystack.co/charge",
                headers={
                    "Authorization": f"Bearer {secret_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                json={
                    "amount": amount_kes * 100,
                    "email": email,
                    "currency": "KES",
                    "reference": reference,
                    "mobile_money": {"provider": "mpesa_offline"},
                },
            )
    except httpx.RequestError as exc:
        return {"accepted": False, "reason": type(exc).__name__}

    try:
        payload = response.json()
    except (ValueError, json.JSONDecodeError):
        payload = {}
    data = payload.get("data") if isinstance(payload, dict) else None
    if response.status_code not in {200, 201, 202} or not isinstance(data, dict) or payload.get("status") is not True:
        return {"accepted": False, "reason": "provider_rejected", "httpStatus": response.status_code}

    provider_reference = str(data.get("reference") or "")
    account_number = str(data.get("account_number") or "")
    account_reference = str(data.get("account_reference") or "")
    if (
        data.get("status") != "pay_offline"
        or not re.fullmatch(r"[A-Za-z0-9_-]{8,100}", provider_reference)
        or not re.fullmatch(r"[A-Za-z0-9-]{3,32}", account_number)
        or not re.fullmatch(r"[A-Za-z0-9-]{1,32}", account_reference)
    ):
        return {"accepted": False, "reason": "invalid_provider_response"}

    return {
        "accepted": True,
        "reference": provider_reference,
        "accountNumber": account_number,
        "accountReference": account_reference,
        "displayText": str(data.get("display_text") or "")[:180],
    }


def verify_webhook_signature(
    body: bytes,
    headers: Any,
    *,
    secret_key: str,
    webhook_secret: str = "",
    now: int | None = None,
) -> bool:
    """Verify Paystack's current timestamped signature or legacy HMAC header."""
    current = int(time.time()) if now is None else now
    signed = headers.get("paystack-signature", "")
    if signed and webhook_secret:
        timestamp: int | None = None
        signatures: list[str] = []
        saw_timestamp = False
        for item in signed.split(","):
            key, separator, value = item.strip().partition("=")
            if not separator:
                continue
            if key == "t":
                if saw_timestamp:
                    return False
                saw_timestamp = True
                try:
                    timestamp = int(value)
                except ValueError:
                    return False
            elif key == "v1":
                _, colon, digest = value.partition(":")
                if colon and re.fullmatch(r"[0-9a-f]{128}", digest):
                    signatures.append(digest)
        if timestamp is None or abs(current - timestamp) > 300 or not signatures:
            return False
        expected = hmac.new(
            webhook_secret.encode("utf-8"),
            str(timestamp).encode("ascii") + b"." + body,
            hashlib.sha512,
        ).hexdigest()
        return any(hmac.compare_digest(expected, signature) for signature in signatures)

    legacy = headers.get("x-paystack-signature", "")
    if not secret_key or not re.fullmatch(r"[0-9a-f]{128}", legacy):
        return False
    expected = hmac.new(secret_key.encode("utf-8"), body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, legacy)
