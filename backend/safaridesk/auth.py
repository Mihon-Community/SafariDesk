"""FastAPI auth and staff-user routers backed by PostgreSQL.

The public contract intentionally matches the former Express API: JSON errors
use ``{error, code}``, authentication uses the ``sd_access`` and ``sd_refresh``
cookies, and refresh tokens are opaque and stored only as SHA-256 hashes.
"""

from __future__ import annotations

import hashlib
import ipaddress
import json
import logging
import re
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from functools import wraps
from inspect import signature
from typing import Any, Callable, Mapping
from urllib.parse import quote

import bcrypt
import jwt
from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse
from psycopg.errors import UniqueViolation
from psycopg_pool import ConnectionPool


logger = logging.getLogger("safaridesk.auth")

ACCESS_COOKIE = "sd_access"
REFRESH_COOKIE = "sd_refresh"
ROLE_COOKIE = "sd_role"

ROLES = {
    "super_admin",
    "admin",
    "operations",
    "dispatcher",
    "finance",
    "agent",
    "driver",
    "customer",
}
STAFF_ROLES = ROLES - {"customer"}
INVITABLE_ROLES = STAFF_ROLES - {"super_admin"}
REQUESTABLE_ROLES = {"customer", "driver", "agent", "operations", "finance"}
PENDING_ROLES = {"driver", "agent", "operations", "finance"}
USER_STATUSES = {"active", "invited", "pending", "disabled"}
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

USER_COLUMNS = """
    id::text AS id, name, email, role, status,
    requested_role AS "requestedRole", last_login_at AS "lastLoginAt",
    created_at AS "createdAt"
"""
USER_PRIVATE_COLUMNS = """
    id::text AS id, name, email, password_hash AS "passwordHash",
    role, status, requested_role AS "requestedRole", phone,
    licence_number AS "licenceNumber", vehicle_reg AS "vehicleReg", company,
    failed_attempts AS "failedAttempts", locked_until AS "lockedUntil",
    last_login_at AS "lastLoginAt", created_at AS "createdAt"
"""


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def _as_dict(row: Any, description: Any = None) -> dict[str, Any] | None:
    if row is None:
        return None
    if isinstance(row, Mapping):
        return dict(row)
    names = [getattr(column, "name", None) or column[0] for column in (description or ())]
    return dict(zip(names, row))


def _one(conn: Any, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    cursor = conn.execute(sql, params)
    return _as_dict(cursor.fetchone(), cursor.description)


def _all(conn: Any, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    cursor = conn.execute(sql, params)
    return [item for row in cursor.fetchall() if (item := _as_dict(row, cursor.description)) is not None]


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return str(value)


def _public_user(user: Mapping[str, Any]) -> dict[str, Any]:
    """Do not include phone, licence, password hash, or lockout internals."""
    return {
        "id": str(user["id"]),
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "status": user["status"],
        "requestedRole": user.get("requestedRole"),
        "lastLoginAt": _iso(user.get("lastLoginAt")),
        "createdAt": _iso(user.get("createdAt")),
    }


def normalize_kenyan_phone(value: str | None) -> str | None:
    if not value:
        return None
    compact = re.sub(r"[\s()-]", "", value.strip())
    if re.fullmatch(r"0[17]\d{8}", compact):
        return "+254" + compact[1:]
    if re.fullmatch(r"254[17]\d{8}", compact):
        return "+" + compact
    if re.fullmatch(r"\+254[17]\d{8}", compact):
        return compact
    return None


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def _sign_access(user_id: str, role: str, settings: Any) -> tuple[str, datetime]:
    now = int(time.time())
    expires_at = datetime.fromtimestamp(now + int(settings.access_ttl_seconds), timezone.utc)
    token = jwt.encode(
        {"sub": str(user_id), "role": role, "type": "access", "iat": now, "exp": int(expires_at.timestamp())},
        settings.jwt_secret,
        algorithm="HS256",
    )
    return token, expires_at


def _decode_access(raw: str, settings: Any) -> dict[str, Any] | None:
    try:
        claims = jwt.decode(raw, settings.jwt_secret, algorithms=["HS256"])
        if claims.get("type") != "access" or not isinstance(claims.get("sub"), str):
            return None
        return claims
    except jwt.PyJWTError:
        return None


def _request_context(request: Request) -> tuple[str | None, str | None]:
    raw_ip = request.client.host if request.client else None
    try:
        ip = ipaddress.ip_address(raw_ip).compressed if raw_ip else None
    except ValueError:
        ip = None
    return (
        ip,
        request.headers.get("user-agent"),
    )


def _audit(
    conn: Any,
    actor_id: str | None,
    action: str,
    target: str | None,
    metadata: Mapping[str, Any] | None,
    ip: str | None,
) -> None:
    conn.execute(
        """INSERT INTO audit_log (actor_id, action, target, metadata, ip)
           VALUES (%s, %s, %s, %s::jsonb, %s)""",
        (actor_id, action, target, json.dumps(dict(metadata or {})), ip),
    )


def _api_error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": message, "code": code})


def _register(
    router: APIRouter,
    method: str,
    path: str,
    handler: Callable[..., Any],
    *,
    status_code: int = 200,
) -> None:
    @wraps(handler)
    async def safe_handler(*args: Any, **kwargs: Any) -> Any:
        try:
            return await handler(*args, **kwargs)
        except ApiError as exc:
            return _api_error(exc.status, exc.code, exc.message)
        except UniqueViolation:
            return _api_error(409, "EMAIL_TAKEN", "An account already exists for that email.")
        except Exception:
            # Never include SQL parameters, passwords, tokens, phone numbers,
            # or raw provider exceptions in client responses or logs.
            logger.error("auth route failed: %s %s", method, path)
            return _api_error(500, "INTERNAL", "Internal server error")

    safe_handler.__signature__ = signature(handler)  # type: ignore[attr-defined]
    router.add_api_route(path, safe_handler, methods=[method], status_code=status_code)


async def _read_body(request: Request) -> dict[str, Any]:
    try:
        body = await request.json()
    except Exception as exc:
        raise ApiError(400, "VALIDATION", "Validation failed") from exc
    if not isinstance(body, dict):
        raise ApiError(400, "VALIDATION", "Validation failed")
    return body


def _text(
    body: Mapping[str, Any],
    key: str,
    *,
    required: bool = True,
    minimum: int = 0,
    maximum: int = 10_000,
    strip: bool = False,
) -> str | None:
    value = body.get(key)
    if value is None and not required:
        return None
    if not isinstance(value, str):
        raise ApiError(400, "VALIDATION", "Validation failed")
    if strip:
        value = value.strip()
    if len(value) < minimum or len(value) > maximum:
        raise ApiError(400, "VALIDATION", "Validation failed")
    return value


def _email(body: Mapping[str, Any], key: str = "email") -> str:
    value = _text(body, key, minimum=3, maximum=160, strip=True)
    assert value is not None
    value = value.lower()
    if not EMAIL_RE.fullmatch(value):
        raise ApiError(400, "VALIDATION", "Validation failed")
    return value


def _password(body: Mapping[str, Any], key: str = "password", *, minimum: int = 8) -> str:
    value = _text(body, key, minimum=minimum, maximum=128)
    assert value is not None
    if "\x00" in value:
        raise ApiError(400, "VALIDATION", "Validation failed")
    # bcrypt interoperates with the existing JS bcrypt implementation, which
    # uses the standard 72-byte input limit.
    if len(value.encode("utf-8")) > 72:
        raise ApiError(400, "VALIDATION", "Password must be at most 72 UTF-8 bytes.")
    return value


def _hash_password(value: str) -> str:
    return bcrypt.hashpw(value.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def _verify_password(value: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    try:
        return bcrypt.checkpw(value.encode("utf-8"), encoded.encode("ascii"))
    except (ValueError, TypeError):
        return False


def _access_token_from(request: Request) -> str | None:
    cookie_token = request.cookies.get(ACCESS_COOKIE)
    if cookie_token:
        return cookie_token
    header = request.headers.get("authorization", "")
    if header.startswith("Bearer "):
        return header[7:]
    return None


def _refresh_token_from(request: Request) -> str | None:
    return request.cookies.get(REFRESH_COOKIE)


def _find_user_by_email(conn: Any, email: str) -> dict[str, Any] | None:
    return _one(conn, f"SELECT {USER_PRIVATE_COLUMNS} FROM users WHERE lower(email) = lower(%s)", (email,))


def _find_user_by_id(conn: Any, user_id: str) -> dict[str, Any] | None:
    try:
        normalized = str(uuid.UUID(str(user_id)))
        return _one(conn, f"SELECT {USER_PRIVATE_COLUMNS} FROM users WHERE id = %s", (normalized,))
    except (ValueError, TypeError):
        return None


def _current_user(request: Request, pool: ConnectionPool, settings: Any) -> dict[str, Any]:
    raw = _access_token_from(request)
    claims = _decode_access(raw, settings) if raw else None
    if not claims:
        raise ApiError(401, "UNAUTHENTICATED", "Sign in required.")
    with pool.connection() as conn:
        user = _find_user_by_id(conn, claims["sub"])
    if not user or user["status"] == "disabled":
        raise ApiError(401, "UNAUTHENTICATED", "Sign in required.")
    return user


def _require_admin(user: Mapping[str, Any]) -> None:
    if user.get("role") not in {"admin", "super_admin"}:
        raise ApiError(403, "FORBIDDEN", "Admin role required.")


def _require_manage(user: Mapping[str, Any]) -> None:
    if user.get("role") not in {"admin", "super_admin"}:
        raise ApiError(403, "FORBIDDEN", "Missing permission users:manage.")


def _set_auth_cookies(response: Response, settings: Any, access: str, refresh: str, role: str) -> None:
    secure = bool(settings.cookie_secure)
    response.set_cookie(
        ACCESS_COOKIE,
        access,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        REFRESH_COOKIE,
        refresh,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/api/auth",
        max_age=int(settings.refresh_ttl_seconds),
    )
    response.set_cookie(
        ROLE_COOKIE,
        role,
        httponly=False,
        secure=secure,
        samesite="lax",
        path="/",
        max_age=int(settings.refresh_ttl_seconds),
    )


def _clear_auth_cookies(response: Response, settings: Any) -> None:
    secure = bool(settings.cookie_secure)
    response.delete_cookie(ACCESS_COOKIE, path="/", secure=secure, httponly=True, samesite="lax")
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth", secure=secure, httponly=True, samesite="lax")
    response.delete_cookie(ROLE_COOKIE, path="/", secure=secure, httponly=False, samesite="lax")


def _issue_session(
    conn: Any,
    user: Mapping[str, Any],
    settings: Any,
    ip: str | None,
    user_agent: str | None,
    family_id: str | None = None,
) -> tuple[str, str, datetime]:
    access, expires_at = _sign_access(str(user["id"]), str(user["role"]), settings)
    refresh = _new_refresh_token()
    conn.execute(
        """INSERT INTO refresh_tokens
           (token_hash, user_id, family_id, user_agent, ip, expires_at)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        (
            _hash_token(refresh),
            user["id"],
            family_id or str(uuid.uuid4()),
            user_agent,
            ip,
            datetime.now(timezone.utc) + timedelta(seconds=int(settings.refresh_ttl_seconds)),
        ),
    )
    return access, refresh, expires_at


def _setting(settings: Any, name: str, default: Any = None) -> Any:
    return getattr(settings, name, default)


def _sms_mode(settings: Any) -> str:
    username = _setting(settings, "at_username", None)
    if username is None:
        username = _setting(settings, "username", None)
    if username is None:
        at_settings = _setting(settings, "at", None)
        username = getattr(at_settings, "username", "") if at_settings is not None else ""
    if username == "sandbox":
        return "sandbox"
    return "live" if username else "unconfigured"


def _sms_message(settings: Any, kind: str, token: str | None = None, role: str | None = None, expires: datetime | None = None) -> str | None:
    base = str(_setting(settings, "public_app_url", "") or "").rstrip("/")
    if kind in {"invite", "password_reset"} and not base:
        return None
    if kind == "invite":
        expiry = (expires or datetime.now(timezone.utc)).date().isoformat()
        return f"SafariDesk {role} invite: {base}/accept-invite?token={quote(token or '', safe='')}. Expires {expiry}."
    if kind == "password_reset":
        return f"SafariDesk password reset: {base}/reset-password?token={quote(token or '', safe='')}. Expires soon. If you did not request this, ignore it."
    if kind == "request_approved":
        return f"SafariDesk: your {role} access request was approved. You can now sign in."
    if kind == "request_rejected":
        return "SafariDesk: your access request was not approved. Contact your administrator for details."
    return None


async def _deliver_sms(
    sms_sender: Callable[[str, str, str], Any] | None,
    phone: str | None,
    message: str | None,
    event_kind: str,
) -> dict[str, Any]:
    if not phone:
        return {"accepted": False, "reason": "no_phone"}
    if not message:
        return {"accepted": False, "reason": "no_public_app_url"}
    if sms_sender is None:
        return {"accepted": False, "reason": "delivery_not_configured"}
    try:
        raw = await sms_sender(phone, message, event_kind)
    except Exception:
        logger.warning("SMS sender raised an error for auth event %s", event_kind)
        return {"accepted": False, "reason": "provider_error", "unknown": True}
    if not isinstance(raw, Mapping):
        return {"accepted": False, "reason": "provider_error", "unknown": True}
    outcome: dict[str, Any] = {"accepted": raw.get("accepted") is True}
    for key in ("reason", "providerStatus", "providerStatusCode", "providerHttpStatus", "providerErrorCode"):
        value = raw.get(key)
        if isinstance(value, (str, int)) and not isinstance(value, bool):
            outcome[key] = value
    return outcome


def _invite_sms_response(outcome: Mapping[str, Any], settings: Any) -> dict[str, Any]:
    if outcome.get("unknown"):
        status = "unknown"
    else:
        status = "submitted" if outcome.get("accepted") is True else "not_sent"
    result: dict[str, Any] = {"status": status, "mode": _sms_mode(settings)}
    for key in ("reason", "providerStatus", "providerStatusCode", "providerHttpStatus", "providerErrorCode"):
        if key in outcome:
            result[key] = outcome[key]
    return result


def _is_unique_violation(error: Exception) -> bool:
    return isinstance(error, UniqueViolation)


def build_auth_routers(
    pool: ConnectionPool,
    settings: Any,
    sms_sender: Callable[[str, str, str], Any] | None,
) -> tuple[APIRouter, APIRouter]:
    """Build API-compatible auth and staff routers using only PostgreSQL.

    ``sms_sender`` is an async callable ``(phone, message, event_kind) -> dict``.
    Invites never return their bearer token from this production router.
    """
    auth = APIRouter(prefix="/api/auth", tags=["auth"])
    users = APIRouter(prefix="/api/users", tags=["users"])

    async def sign_up(request: Request, response: Response) -> Any:
        body = await _read_body(request)
        name = _text(body, "name", minimum=2, maximum=80, strip=True)
        email = _email(body)
        password = _password(body)
        requested_role = body.get("requestedRole", "customer")
        if not isinstance(requested_role, str):
            raise ApiError(400, "VALIDATION", "Validation failed")
        requested_role = requested_role.strip().lower()
        if requested_role in {"admin", "super_admin"}:
            raise ApiError(403, "FORBIDDEN_ROLE", "That role cannot be requested at sign-up.")
        if requested_role not in REQUESTABLE_ROLES:
            raise ApiError(400, "VALIDATION", "Choose a valid role.")
        phone_raw = _text(body, "phone", required=False, maximum=24, strip=True)
        phone = normalize_kenyan_phone(phone_raw) if phone_raw else None
        if phone_raw and not phone:
            raise ApiError(400, "INVALID_PHONE", "Enter a valid Kenyan mobile number.")
        licence = _text(body, "licenceNumber", required=False, maximum=40, strip=True)
        vehicle = _text(body, "vehicleReg", required=False, maximum=24, strip=True)
        company = _text(body, "company", required=False, maximum=120, strip=True)
        needs_approval = requested_role in PENDING_ROLES
        role = "customer" if needs_approval else requested_role
        status = "pending" if needs_approval else "active"
        ip, user_agent = _request_context(request)
        user_id = str(uuid.uuid4())
        try:
            with pool.connection() as conn:
                if _find_user_by_email(conn, email):
                    raise ApiError(409, "EMAIL_TAKEN", "An account already exists for that email.")
                user = _one(
                    conn,
                    f"""INSERT INTO users
                       (id, name, email, password_hash, role, status, requested_role,
                        phone, licence_number, vehicle_reg, company)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                       RETURNING {USER_COLUMNS}""",
                    (
                        user_id, name, email, _hash_password(password), role, status,
                        requested_role if needs_approval else None, phone, licence, vehicle, company,
                    ),
                )
                _audit(conn, user_id, "auth.access_requested" if needs_approval else "auth.sign_up", email,
                       {"requestedRole": requested_role}, ip)
                if not needs_approval:
                    access, refresh, expires = _issue_session(conn, user or {"id": user_id, "role": role}, settings, ip, user_agent)
        except UniqueViolation as exc:
            raise ApiError(409, "EMAIL_TAKEN", "An account already exists for that email.") from exc
        assert user is not None
        if not needs_approval:
            _set_auth_cookies(response, settings, access, refresh, role)
        return {"user": _public_user(user), "pending": needs_approval}

    async def sign_in(request: Request, response: Response) -> Any:
        body = await _read_body(request)
        email = _email(body)
        password = _password(body, minimum=1)
        ip, user_agent = _request_context(request)
        error_after_commit: ApiError | None = None
        result: tuple[dict[str, Any], str, str, datetime] | None = None
        with pool.connection() as conn:
            user = _find_user_by_email(conn, email)
            if not user or user["status"] == "disabled":
                _audit(conn, None, "auth.sign_in_failed", None, {"reason": "unknown_email"}, ip)
                error_after_commit = ApiError(401, "BAD_CREDENTIALS", "Invalid email or password.")
            else:
                locked_until = user.get("lockedUntil")
                now = datetime.now(timezone.utc)
                if locked_until and locked_until > now:
                    error_after_commit = ApiError(423, "LOCKED", "Too many failed attempts. Try again later.")
                elif not _verify_password(password, user.get("passwordHash")):
                    attempts = int(user.get("failedAttempts") or 0) + 1
                    max_attempts = int(_setting(settings, "max_failed_attempts", 5))
                    lock_minutes = int(_setting(settings, "lockout_minutes", 15))
                    next_lock = now + timedelta(minutes=lock_minutes) if attempts >= max_attempts else None
                    conn.execute(
                        "UPDATE users SET failed_attempts = %s, locked_until = %s WHERE id = %s",
                        (attempts, next_lock, user["id"]),
                    )
                    _audit(conn, str(user["id"]), "auth.sign_in_failed", None, {"failedAttempts": attempts}, ip)
                    error_after_commit = (
                        ApiError(423, "LOCKED", "Too many failed attempts. Try again later.")
                        if next_lock
                        else ApiError(401, "BAD_CREDENTIALS", "Invalid email or password.")
                    )
                elif user["status"] == "pending":
                    _audit(conn, str(user["id"]), "auth.sign_in_blocked", None, {"reason": "pending_approval"}, ip)
                    error_after_commit = ApiError(403, "PENDING_APPROVAL", "Your access request is awaiting admin approval.")
                else:
                    updated = _one(
                        conn,
                        f"""UPDATE users SET failed_attempts = 0, locked_until = NULL,
                               last_login_at = now(), updated_at = now()
                           WHERE id = %s RETURNING {USER_COLUMNS}""",
                        (user["id"],),
                    )
                    assert updated is not None
                    access, refresh, expires = _issue_session(conn, updated, settings, ip, user_agent)
                    _audit(conn, str(user["id"]), "auth.sign_in", None, {}, ip)
                    result = (updated, access, refresh, expires)
        if error_after_commit:
            raise error_after_commit
        assert result is not None
        updated, access, refresh, expires = result
        _set_auth_cookies(response, settings, access, refresh, str(updated["role"]))
        return {"user": _public_user(updated), "expiresAt": _iso(expires)}

    async def refresh(request: Request, response: Response) -> Any:
        presented = _refresh_token_from(request)
        if not presented:
            raise ApiError(401, "INVALID_REFRESH", "Sign in again.")
        token_hash = _hash_token(presented)
        ip, user_agent = _request_context(request)
        error_after_commit: ApiError | None = None
        result: tuple[dict[str, Any], str, str, datetime] | None = None
        with pool.connection() as conn:
            session = _one(
                conn,
                """SELECT token_hash, user_id::text AS user_id, family_id::text AS family_id,
                          expires_at, revoked_at
                   FROM refresh_tokens WHERE token_hash = %s FOR UPDATE""",
                (token_hash,),
            )
            if not session:
                raise ApiError(401, "INVALID_REFRESH", "Your session has ended. Sign in again.")
            if session.get("revoked_at"):
                conn.execute("UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = %s", (session["family_id"],))
                _audit(conn, str(session["user_id"]), "auth.refresh_reuse", None, {"familyId": str(session["family_id"])}, ip)
                error_after_commit = ApiError(401, "SESSION_REUSED", "Your session was revoked. Sign in again.")
            elif session["expires_at"] <= datetime.now(timezone.utc):
                conn.execute("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = %s", (token_hash,))
                error_after_commit = ApiError(401, "INVALID_REFRESH", "Your session has expired. Sign in again.")
            else:
                user = _find_user_by_id(conn, str(session["user_id"]))
                if not user or user["status"] == "disabled":
                    error_after_commit = ApiError(401, "INVALID_REFRESH", "Your session has ended. Sign in again.")
                    conn.execute("UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = %s", (session["family_id"],))
                else:
                    access, expires = _sign_access(str(user["id"]), str(user["role"]), settings)
                    next_refresh = _new_refresh_token()
                    conn.execute(
                        "UPDATE refresh_tokens SET revoked_at = now(), replaced_at = now() WHERE token_hash = %s",
                        (token_hash,),
                    )
                    conn.execute(
                        """INSERT INTO refresh_tokens
                           (token_hash, user_id, family_id, user_agent, ip, expires_at)
                           VALUES (%s, %s, %s, %s, %s, %s)""",
                        (
                            _hash_token(next_refresh), user["id"], session["family_id"], user_agent, ip,
                            datetime.now(timezone.utc) + timedelta(seconds=int(settings.refresh_ttl_seconds)),
                        ),
                    )
                    result = (user, access, next_refresh, expires)
        if error_after_commit:
            raise error_after_commit
        assert result is not None
        user, access, next_refresh, expires = result
        _set_auth_cookies(response, settings, access, next_refresh, str(user["role"]))
        return {"user": _public_user(user), "expiresAt": _iso(expires)}

    async def sign_out(request: Request, response: Response) -> Any:
        presented = _refresh_token_from(request)
        access_token = _access_token_from(request)
        claims = _decode_access(access_token, settings) if access_token else None
        actor_id = claims["sub"] if claims else None
        ip, _ = _request_context(request)
        with pool.connection() as conn:
            if presented:
                conn.execute("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = %s AND revoked_at IS NULL", (_hash_token(presented),))
            _audit(conn, actor_id, "auth.sign_out", None, {}, ip)
        _clear_auth_cookies(response, settings)
        return {"ok": True}

    async def me(request: Request) -> Any:
        user = _current_user(request, pool, settings)
        return {"user": _public_user(user)}

    async def forgot_password(request: Request) -> Any:
        body = await _read_body(request)
        email = _email(body)
        ip, _ = _request_context(request)
        user: dict[str, Any] | None = None
        raw_token: str | None = None
        expires: datetime | None = None
        with pool.connection() as conn:
            user = _find_user_by_email(conn, email)
            if user:
                raw_token = _new_refresh_token()
                expires = datetime.now(timezone.utc) + timedelta(minutes=int(settings.password_reset_ttl_minutes))
                conn.execute(
                    "INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (%s, %s, %s)",
                    (_hash_token(raw_token), user["id"], expires),
                )
                _audit(conn, str(user["id"]), "auth.password_reset_requested", None, {}, ip)
        if user and raw_token and user.get("phone"):
            await _deliver_sms(
                sms_sender,
                user.get("phone"),
                _sms_message(settings, "password_reset", token=raw_token, expires=expires),
                "password_reset",
            )
        # Same response for known and unknown emails to prevent enumeration.
        return {"ok": True}

    async def reset_password(request: Request) -> Any:
        body = await _read_body(request)
        raw = _text(body, "token", minimum=10, maximum=512)
        password = _password(body)
        ip, _ = _request_context(request)
        with pool.connection() as conn:
            reset = _one(
                conn,
                """UPDATE password_resets SET used_at = now()
                   WHERE token_hash = %s AND used_at IS NULL AND expires_at > now()
                   RETURNING user_id::text AS user_id""",
                (_hash_token(raw or ""),),
            )
            if not reset:
                raise ApiError(400, "INVALID_TOKEN", "This reset link is invalid or has expired.")
            conn.execute(
                """UPDATE users SET password_hash = %s, failed_attempts = 0,
                       locked_until = NULL, updated_at = now() WHERE id = %s""",
                (_hash_password(password), reset["user_id"]),
            )
            conn.execute("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = %s AND revoked_at IS NULL", (reset["user_id"],))
            _audit(conn, str(reset["user_id"]), "auth.password_reset", None, {}, ip)
        return {"ok": True}

    async def invite(request: Request) -> Any:
        actor = _current_user(request, pool, settings)
        _require_admin(actor)
        body = await _read_body(request)
        email = _email(body)
        role = body.get("role")
        if not isinstance(role, str) or role not in INVITABLE_ROLES:
            raise ApiError(400, "BAD_ROLE", "Choose a staff role to invite.")
        phone_raw = _text(body, "phone", required=False, maximum=24, strip=True)
        phone = normalize_kenyan_phone(phone_raw) if phone_raw else None
        if phone_raw and not phone:
            raise ApiError(400, "INVALID_PHONE", "Enter a valid Kenyan mobile number.")
        raw_token = _new_refresh_token()
        expires = datetime.now(timezone.utc) + timedelta(days=int(settings.invite_ttl_days))
        invite_hash = _hash_token(raw_token)
        ip, _ = _request_context(request)
        with pool.connection() as conn:
            if _find_user_by_email(conn, email):
                raise ApiError(409, "EMAIL_TAKEN", "An account already exists for that email.")
            conn.execute(
                """INSERT INTO invites (token_hash, email, phone, role, invited_by, expires_at)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (invite_hash, email, phone, role, actor["id"], expires),
            )
            _audit(conn, str(actor["id"]), "auth.invite_created", email, {"role": role}, ip)
        outcome = await _deliver_sms(
            sms_sender,
            phone,
            _sms_message(settings, "invite", token=raw_token, role=role, expires=expires),
            "invite",
        )
        # No devToken or raw token is ever returned from this production router.
        return {"ok": True, "sms": _invite_sms_response(outcome, settings)}

    async def accept_invite(request: Request) -> Any:
        body = await _read_body(request)
        raw_token = _text(body, "token", minimum=10, maximum=512)
        name = _text(body, "name", minimum=2, maximum=80, strip=True)
        password = _password(body)
        ip, _ = _request_context(request)
        token_hash = _hash_token(raw_token or "")
        with pool.connection() as conn:
            invite_row = _one(
                conn,
                """SELECT token_hash, email, phone, role, expires_at
                   FROM invites WHERE token_hash = %s AND accepted_at IS NULL FOR UPDATE""",
                (token_hash,),
            )
            if not invite_row or invite_row["expires_at"] <= datetime.now(timezone.utc):
                raise ApiError(400, "INVALID_INVITE", "This invitation is invalid or has expired.")
            user_id = str(uuid.uuid4())
            user = _one(
                conn,
                f"""INSERT INTO users (id, name, email, password_hash, role, status, phone)
                   VALUES (%s, %s, %s, %s, %s, 'active', %s)
                   RETURNING {USER_COLUMNS}""",
                (user_id, name, invite_row["email"], _hash_password(password), invite_row["role"], invite_row.get("phone")),
            )
            conn.execute("UPDATE invites SET accepted_at = now() WHERE token_hash = %s", (token_hash,))
            _audit(conn, user_id, "auth.invite_accepted", str(invite_row["email"]), {"role": invite_row["role"]}, ip)
        assert user is not None
        return {"user": _public_user(user)}

    async def list_users(request: Request) -> Any:
        actor = _current_user(request, pool, settings)
        if actor.get("role") not in {"admin", "super_admin"}:
            raise ApiError(403, "FORBIDDEN", "Missing permission users:read.")
        with pool.connection() as conn:
            records = _all(conn, f"SELECT {USER_COLUMNS} FROM users ORDER BY created_at")
        return {"users": [_public_user(item) for item in records]}

    async def list_pending(request: Request) -> Any:
        actor = _current_user(request, pool, settings)
        if actor.get("role") not in {"admin", "super_admin"}:
            raise ApiError(403, "FORBIDDEN", "Missing permission users:read.")
        with pool.connection() as conn:
            records = _all(conn, f"SELECT {USER_COLUMNS} FROM users WHERE status = 'pending' ORDER BY created_at")
        return {"users": [_public_user(item) for item in records]}

    async def update_user(user_id: str, request: Request) -> Any:
        actor = _current_user(request, pool, settings)
        _require_manage(actor)
        body = await _read_body(request)
        unknown = set(body) - {"role", "status"}
        if unknown:
            raise ApiError(400, "VALIDATION", "Validation failed")
        role = body.get("role")
        status = body.get("status")
        if role is not None and (not isinstance(role, str) or role not in ROLES):
            raise ApiError(400, "BAD_ROLE", "Unknown role.")
        if status is not None and (not isinstance(status, str) or status not in USER_STATUSES):
            raise ApiError(400, "BAD_STATUS", "Unknown status.")
        if role is None and status is None:
            raise ApiError(400, "NOTHING_TO_UPDATE", "Provide a role or status.")
        if str(actor["id"]) == user_id:
            if role is not None and role != actor["role"]:
                raise ApiError(400, "CANNOT_CHANGE_OWN_ROLE", "You cannot change your own role.")
            if status is not None and status != "active":
                raise ApiError(400, "CANNOT_DISABLE_SELF", "You cannot disable your own account.")
        if role == "super_admin" and actor["role"] != "super_admin":
            raise ApiError(403, "SUPER_ADMIN_REQUIRED", "Only a super admin can grant that role.")
        ip, _ = _request_context(request)
        with pool.connection() as conn:
            target = _find_user_by_id(conn, user_id)
            if not target:
                raise ApiError(404, "NOT_FOUND", "User not found.")
            setters: list[str] = []
            params: list[Any] = []
            if role is not None:
                setters.append("role = %s")
                params.append(role)
            if status is not None:
                setters.append("status = %s")
                params.append(status)
            setters.append("updated_at = now()")
            params.append(user_id)
            updated = _one(
                conn,
                f"UPDATE users SET {', '.join(setters)} WHERE id = %s RETURNING {USER_COLUMNS}",
                tuple(params),
            )
            if status == "disabled":
                conn.execute("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = %s AND revoked_at IS NULL", (user_id,))
            _audit(conn, str(actor["id"]), "users.updated", user_id, {"role": role, "status": status}, ip)
        assert updated is not None
        return {"user": _public_user(updated)}

    async def admin_password_reset(user_id: str, request: Request) -> Any:
        actor = _current_user(request, pool, settings)
        _require_manage(actor)
        ip, _ = _request_context(request)
        raw_token: str | None = None
        expires: datetime | None = None
        target: dict[str, Any] | None = None
        with pool.connection() as conn:
            target = _find_user_by_id(conn, user_id)
            if not target:
                raise ApiError(404, "NOT_FOUND", "User not found.")
            raw_token = _new_refresh_token()
            expires = datetime.now(timezone.utc) + timedelta(minutes=int(settings.password_reset_ttl_minutes))
            conn.execute(
                "INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (%s, %s, %s)",
                (_hash_token(raw_token), target["id"], expires),
            )
            _audit(conn, str(actor["id"]), "users.password_reset", user_id, {"targetId": user_id}, ip)
        await _deliver_sms(
            sms_sender,
            target.get("phone") if target else None,
            _sms_message(settings, "password_reset", token=raw_token, expires=expires),
            "password_reset",
        )
        return {"ok": True}

    async def approve_request(user_id: str, request: Request) -> Any:
        actor = _current_user(request, pool, settings)
        _require_manage(actor)
        ip, _ = _request_context(request)
        with pool.connection() as conn:
            target = _find_user_by_id(conn, user_id)
            if not target or target.get("status") != "pending" or not target.get("requestedRole"):
                raise ApiError(400, "INVALID_REQUEST", "That account has no pending request.")
            role = target["requestedRole"]
            updated = _one(
                conn,
                f"""UPDATE users SET role = %s, status = 'active', requested_role = NULL,
                       updated_at = now() WHERE id = %s RETURNING {USER_COLUMNS}""",
                (role, user_id),
            )
            _audit(conn, str(actor["id"]), "users.request_approved", user_id, {"targetId": user_id, "role": role}, ip)
        assert updated is not None
        message = _sms_message(settings, "request_approved", role=role)
        if target.get("phone"):
            await _deliver_sms(sms_sender, target.get("phone"), message, "request_approved")
        return {"user": _public_user(updated)}

    async def reject_request(user_id: str, request: Request) -> Any:
        actor = _current_user(request, pool, settings)
        _require_manage(actor)
        ip, _ = _request_context(request)
        with pool.connection() as conn:
            target = _find_user_by_id(conn, user_id)
            if not target or target.get("status") != "pending":
                raise ApiError(400, "INVALID_REQUEST", "That account has no pending request.")
            conn.execute("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = %s AND revoked_at IS NULL", (user_id,))
            updated = _one(
                conn,
                f"""UPDATE users SET status = 'disabled', requested_role = NULL,
                       updated_at = now() WHERE id = %s RETURNING {USER_COLUMNS}""",
                (user_id,),
            )
            _audit(conn, str(actor["id"]), "users.request_rejected", user_id, {"targetId": user_id}, ip)
        assert updated is not None
        if target.get("phone"):
            await _deliver_sms(sms_sender, target.get("phone"), _sms_message(settings, "request_rejected"), "request_rejected")
        return {"user": _public_user(updated)}

    for route in (
        ("POST", "/sign-up", sign_up, 201),
        ("POST", "/sign-in", sign_in, 200),
        ("POST", "/refresh", refresh, 200),
        ("POST", "/sign-out", sign_out, 200),
        ("GET", "/me", me, 200),
        ("POST", "/forgot-password", forgot_password, 200),
        ("POST", "/reset-password", reset_password, 200),
        ("POST", "/invite", invite, 201),
        ("POST", "/accept-invite", accept_invite, 201),
    ):
        method, path, handler, status_code = route
        _register(auth, method, path, handler, status_code=status_code)

    for route in (
        # Keep the no-slash URL used by the Next.js API client from receiving
        # an upstream redirect that would move the browser off localhost and
        # drop its same-origin auth cookies.
        ("GET", "", list_users, 200),
        ("GET", "/", list_users, 200),
        ("GET", "/pending", list_pending, 200),
        ("PATCH", "/{user_id}", update_user, 200),
        ("POST", "/{user_id}/password-reset", admin_password_reset, 200),
        ("POST", "/{user_id}/approve", approve_request, 200),
        ("POST", "/{user_id}/reject", reject_request, 200),
    ):
        method, path, handler, status_code = route
        _register(users, method, path, handler, status_code=status_code)

    return auth, users
