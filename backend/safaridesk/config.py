from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env", override=False)


def _phone_list(value: str) -> tuple[str, ...]:
    numbers: list[str] = []
    for item in re.split(r"[,;\s]+", value):
        digits = re.sub(r"\D", "", item)
        if digits.startswith("0"):
            digits = "254" + digits[1:]
        if digits.startswith("254") and len(digits) == 12:
            normalized = "+" + digits
            if normalized not in numbers:
                numbers.append(normalized)
    return tuple(numbers)


@dataclass(frozen=True)
class Settings:
    port: int
    environment: str
    database_url: str
    jwt_secret: str
    access_ttl_seconds: int
    refresh_ttl_seconds: int
    password_reset_ttl_minutes: int
    invite_ttl_days: int
    cookie_secure: bool
    cors_origins: tuple[str, ...]
    admin_email: str
    admin_password: str
    admin_name: str
    auth_rate_limit: int
    max_failed_attempts: int
    lockout_minutes: int
    at_username: str
    at_api_key: str
    at_sender_id: str
    at_test_phone: str
    at_allowed_phones: tuple[str, ...]
    at_ussd_service_code: str
    webhook_token: str
    public_base_url: str
    public_app_url: str
    at_webhook_rate_limit: int
    paystack_secret_key: str
    paystack_webhook_secret: str

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            port=int(os.getenv("PORT", "3001")),
            environment=os.getenv("ENVIRONMENT", "development"),
            database_url=os.getenv("DATABASE_URL", "").strip(),
            jwt_secret=os.getenv("JWT_SECRET", "dev-only-insecure-secret-change-me"),
            access_ttl_seconds=int(os.getenv("ACCESS_TTL_SECONDS", "900")),
            refresh_ttl_seconds=int(os.getenv("REFRESH_TTL_SECONDS", "2592000")),
            password_reset_ttl_minutes=int(os.getenv("PASSWORD_RESET_TTL_MINUTES", "30")),
            invite_ttl_days=int(os.getenv("INVITE_TTL_DAYS", "7")),
            cookie_secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
            cors_origins=tuple(
                part.strip()
                for part in os.getenv(
                    "CORS_ORIGINS",
                    "http://localhost:3000,http://localhost:3002",
                ).split(",")
                if part.strip()
            ),
            admin_email=os.getenv("ADMIN_EMAIL", "").strip().lower(),
            admin_password=os.getenv("ADMIN_PASSWORD", ""),
            admin_name=os.getenv("ADMIN_NAME", "SafariDesk Admin").strip(),
            auth_rate_limit=int(os.getenv("AUTH_RATE_LIMIT", "30")),
            max_failed_attempts=int(os.getenv("MAX_FAILED_ATTEMPTS", "5")),
            lockout_minutes=int(os.getenv("LOCKOUT_MINUTES", "15")),
            at_username=os.getenv("AT_USERNAME", "").strip(),
            at_api_key=os.getenv("AT_API_KEY", "").strip(),
            at_sender_id=os.getenv("AT_SENDER_ID", "").strip(),
            at_test_phone=os.getenv("AT_TEST_PHONE", "").strip(),
            at_allowed_phones=_phone_list(os.getenv("AT_ALLOWED_PHONES", "")),
            at_ussd_service_code=os.getenv("AT_USSD_SERVICE_CODE", "").strip(),
            webhook_token=os.getenv("WEBHOOK_TOKEN", "").strip(),
            public_base_url=os.getenv("PUBLIC_BASE_URL", "").rstrip("/"),
            public_app_url=os.getenv("PUBLIC_APP_URL", "http://localhost:3002").rstrip("/"),
            at_webhook_rate_limit=int(os.getenv("AT_WEBHOOK_RATE_LIMIT", "120")),
            paystack_secret_key=os.getenv("PAYSTACK_SECRET_KEY", "").strip(),
            paystack_webhook_secret=os.getenv("PAYSTACK_WEBHOOK_SECRET", "").strip(),
        )


settings = Settings.from_env()
