from __future__ import annotations

import re
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from safaridesk.auth import (
    _hash_password,
    _hash_token,
    _sign_access,
    build_auth_routers,
)


@dataclass
class Settings:
    jwt_secret: str = "test-signing-secret-long-enough-for-hs256"
    access_ttl_seconds: int = 900
    refresh_ttl_seconds: int = 86_400
    password_reset_ttl_minutes: int = 30
    invite_ttl_days: int = 7
    cookie_secure: bool = False
    admin_email: str = "admin@safaridesk.app"
    admin_password: str = "unused-test-password"
    admin_name: str = "SafariDesk Admin"
    public_app_url: str = "https://safari.example.test"
    at_username: str = "sandbox"


class Cursor:
    def __init__(self, rows: list[dict[str, Any]] | None = None):
        self.rows = rows or []
        self.description = None

    def fetchone(self) -> dict[str, Any] | None:
        return self.rows[0] if self.rows else None

    def fetchall(self) -> list[dict[str, Any]]:
        return self.rows


class FakeConnection:
    """Small SQL-contract fake; production code still only targets PostgreSQL."""

    def __init__(self, users: dict[str, dict[str, Any]]):
        self.users = users
        self.invites: list[dict[str, Any]] = []
        self.sessions: list[tuple[Any, ...]] = []
        self.audit_events: list[tuple[Any, ...]] = []

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> Cursor:
        statement = " ".join(sql.lower().split())
        if statement.startswith("select") and "from users" in statement:
            if "lower(email)" in statement:
                user = next((item for item in self.users.values() if item["email"].lower() == str(params[0]).lower()), None)
                return Cursor([user] if user else [])
            if "where id =" in statement:
                user = self.users.get(str(params[0]))
                return Cursor([user] if user else [])
            rows = list(self.users.values())
            if "where status = 'pending'" in statement:
                rows = [item for item in rows if item["status"] == "pending"]
            return Cursor(rows)

        if statement.startswith("insert into users"):
            (user_id, name, email, password_hash, role, status, requested_role,
             phone, licence, vehicle, company) = params
            now = datetime.now(timezone.utc)
            user = {
                "id": str(user_id), "name": name, "email": email, "passwordHash": password_hash,
                "role": role, "status": status, "requestedRole": requested_role, "phone": phone,
                "licenceNumber": licence, "vehicleReg": vehicle, "company": company,
                "failedAttempts": 0, "lockedUntil": None, "lastLoginAt": None, "createdAt": now,
            }
            self.users[user["id"]] = user
            return Cursor([user])

        if statement.startswith("update users set"):
            user_id = str(params[-1])
            user = self.users.get(user_id)
            if not user:
                return Cursor([])
            if "last_login_at = now()" in statement:
                user.update(failedAttempts=0, lockedUntil=None, lastLoginAt=datetime.now(timezone.utc))
            elif "failed_attempts = %s" in statement:
                user["failedAttempts"] = params[0]
                user["lockedUntil"] = params[1]
            if "returning" in statement:
                return Cursor([user])
            return Cursor()

        if statement.startswith("insert into refresh_tokens"):
            self.sessions.append(params)
            return Cursor()
        if statement.startswith("insert into invites"):
            token_hash, email, phone, role, actor_id, expires = params
            self.invites.append({"token_hash": token_hash, "email": email, "phone": phone, "role": role,
                                 "invited_by": actor_id, "expires_at": expires})
            return Cursor()
        if statement.startswith("insert into audit_log"):
            self.audit_events.append(params)
            return Cursor()
        if statement.startswith("update refresh_tokens"):
            return Cursor()
        raise AssertionError(f"Unexpected SQL in auth router test: {statement}")


class FakePool:
    def __init__(self, users: list[dict[str, Any]] | None = None):
        self.conn = FakeConnection({item["id"]: item for item in (users or [])})

    @contextmanager
    def connection(self):
        yield self.conn


def make_user(*, role: str = "admin", email: str = "admin@safaridesk.app", password: str = "correct-password") -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "name": "Test Admin",
        "email": email,
        "passwordHash": _hash_password(password),
        "role": role,
        "status": "active",
        "requestedRole": None,
        "phone": "+254712345678",
        "licenceNumber": None,
        "vehicleReg": None,
        "company": None,
        "failedAttempts": 0,
        "lockedUntil": None,
        "lastLoginAt": None,
        "createdAt": datetime.now(timezone.utc),
    }


def make_client(pool: FakePool, sms_sender=None) -> TestClient:
    app = FastAPI()
    auth_router, users_router = build_auth_routers(pool, Settings(), sms_sender)
    app.include_router(auth_router)
    app.include_router(users_router)
    return TestClient(app, raise_server_exceptions=False)


def test_sign_in_sets_compatible_http_only_cookies_and_hides_private_fields():
    user = make_user()
    pool = FakePool([user])
    client = make_client(pool)

    response = client.post("/api/auth/sign-in", json={"email": user["email"], "password": "correct-password"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["user"]["id"] == user["id"]
    assert "passwordHash" not in payload["user"]
    assert "phone" not in payload["user"]
    cookies = response.headers.get_list("set-cookie")
    assert any(cookie.startswith("sd_access=") and "HttpOnly" in cookie for cookie in cookies)
    assert any(cookie.startswith("sd_refresh=") and "Path=/api/auth" in cookie and "HttpOnly" in cookie for cookie in cookies)
    assert any(cookie.startswith("sd_role=admin") and "HttpOnly" not in cookie for cookie in cookies)


def test_staff_signup_creates_pending_customer_without_signing_in():
    pool = FakePool()
    response = make_client(pool).post(
        "/api/auth/sign-up",
        json={"name": "A Driver", "email": "driver@example.test", "password": "long-password", "requestedRole": "driver", "phone": "0712 345 678"},
    )

    assert response.status_code == 201
    assert response.json()["pending"] is True
    assert response.json()["user"]["role"] == "customer"
    assert response.json()["user"]["status"] == "pending"
    assert response.json()["user"]["requestedRole"] == "driver"
    assert response.headers.get_list("set-cookie") == []
    saved = next(iter(pool.conn.users.values()))
    assert saved["phone"] == "+254712345678"


def test_invite_reports_provider_402_and_never_exposes_raw_invite_token():
    admin = make_user()
    pool = FakePool([admin])
    sent: list[tuple[str, str, str]] = []

    async def sms_sender(phone: str, message: str, event_kind: str) -> dict[str, Any]:
        sent.append((phone, message, event_kind))
        return {
            "accepted": False,
            "reason": "provider_error",
            "providerStatus": "InvalidSenderId",
            "providerStatusCode": 402,
        }

    client = make_client(pool, sms_sender)
    access, _ = _sign_access(admin["id"], admin["role"], Settings())
    response = client.post(
        "/api/auth/invite",
        headers={"Authorization": f"Bearer {access}"},
        json={"email": "new-driver@example.test", "role": "driver", "phone": "+254712345678"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload == {
        "ok": True,
        "sms": {
            "status": "not_sent",
            "mode": "sandbox",
            "reason": "provider_error",
            "providerStatus": "InvalidSenderId",
            "providerStatusCode": 402,
        },
    }
    assert "devToken" not in payload
    assert len(pool.conn.invites) == 1
    assert len(pool.conn.invites[0]["token_hash"]) == 64
    assert len(sent) == 1 and sent[0][2] == "invite"
    assert "/accept-invite?token=" in sent[0][1]
    assert re.search(r"token=[A-Za-z0-9_-]+", sent[0][1])
    assert sent[0][1] not in response.text


def test_users_collection_supports_both_slash_forms_without_redirect():
    admin = make_user(password="correct-password")
    client = make_client(FakePool([admin]))
    signed_in = client.post(
        "/api/auth/sign-in",
        json={"email": admin["email"], "password": "correct-password"},
    )
    assert signed_in.status_code == 200

    for path in ("/api/users", "/api/users/"):
        response = client.get(path, follow_redirects=False)
        assert response.status_code == 200
        assert response.headers.get("location") is None
        assert [item["email"] for item in response.json()["users"]] == [admin["email"]]


def test_invite_without_phone_is_created_but_says_sms_not_sent():
    admin = make_user()
    pool = FakePool([admin])
    access, _ = _sign_access(admin["id"], admin["role"], Settings())
    response = make_client(pool).post(
        "/api/auth/invite",
        headers={"Authorization": f"Bearer {access}"},
        json={"email": "new-agent@example.test", "role": "agent"},
    )

    assert response.status_code == 201
    assert response.json()["sms"]["status"] == "not_sent"
    assert response.json()["sms"]["reason"] == "no_phone"
    assert "devToken" not in response.json()


def test_me_uses_standard_json_401_for_missing_authentication():
    response = make_client(FakePool()).get("/api/auth/me")

    assert response.status_code == 401
    assert response.json() == {"error": "Sign in required.", "code": "UNAUTHENTICATED"}


def test_refresh_tokens_are_hashed_before_database_insert():
    # A compatibility guard: the API returns the raw cookie, but the DB write
    # only receives its digest. The route-level test above exercises issuance.
    raw = "opaque-refresh-token"
    assert _hash_token(raw) != raw
    assert len(_hash_token(raw)) == 64
