from __future__ import annotations

from typing import Any, Callable

from fastapi import Depends, Request

from .auth import ApiError, _current_user

_ALL_OPERATIONAL = {
    "bookings:read", "bookings:write", "dispatch:read", "dispatch:write",
    "drivers:read", "drivers:write", "vehicles:read", "vehicles:write",
    "payments:read", "payments:mark", "payments:refund", "rates:read",
    "rates:write", "feedback:read", "feedback:write", "alerts:read",
    "alerts:write", "reports:read", "users:read", "users:manage",
    "invites:send", "concierge:use", "itinerary:read",
}
ROLE_PERMISSIONS: dict[str, set[str]] = {
    "super_admin": _ALL_OPERATIONAL | {"audit:read", "settings:manage"},
    "admin": _ALL_OPERATIONAL,
    "operations": {
        "bookings:read", "bookings:write", "dispatch:read", "dispatch:write",
        "drivers:read", "drivers:write", "vehicles:read", "vehicles:write",
        "payments:read", "alerts:read", "alerts:write", "feedback:read",
        "reports:read", "itinerary:read",
    },
    "dispatcher": {
        "bookings:read", "dispatch:read", "dispatch:write", "drivers:read",
        "drivers:write", "vehicles:read", "payments:read", "alerts:read",
        "alerts:write", "itinerary:read",
    },
    "finance": {
        "bookings:read", "payments:read", "payments:mark", "payments:refund",
        "rates:read", "feedback:read", "reports:read",
    },
    "agent": {
        "bookings:read", "bookings:write", "rates:read", "feedback:read",
        "feedback:write", "concierge:use", "itinerary:read",
    },
    "driver": {"dispatch:read", "bookings:read", "itinerary:read", "drivers:read"},
    "customer": {"bookings:read", "payments:read", "feedback:write", "concierge:use", "itinerary:read"},
}


def build_auth_dependencies(pool: Any, settings: Any) -> tuple[Callable[..., Any], Callable[[str], Callable[..., Any]]]:
    """Create reusable FastAPI dependencies for authenticated routes and RBAC."""

    def require_auth(request: Request) -> dict[str, Any]:
        return _current_user(request, pool, settings)

    def require_permission(permission: str) -> Callable[..., Any]:
        def check(user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
            if permission not in ROLE_PERMISSIONS.get(str(user.get("role")), set()):
                raise ApiError(403, "FORBIDDEN", f"Missing permission {permission}.")
            return user

        return check

    return require_auth, require_permission

