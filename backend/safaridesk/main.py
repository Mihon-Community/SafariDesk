from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

import socketio
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .auth import ApiError, build_auth_routers
from .bootstrap import bootstrap_admin
from .config import Settings, settings as default_settings
from .db import apply_migrations, create_pool
from .domain import build_domain_router
from .permissions import build_auth_dependencies
from .security_logging import WebhookQueryRedactionFilter
from .telecom import build_telecom_router, send_sms

logger = logging.getLogger("safaridesk.api")
logging.getLogger("uvicorn.access").addFilter(WebhookQueryRedactionFilter())


def create_app(
    settings: Settings = default_settings,
    *,
    pool: Any = None,
    initialize_database: bool = True,
) -> FastAPI:
    owns_pool = pool is None
    database_pool = pool or create_pool(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if owns_pool:
            database_pool.open(wait=True)
        if initialize_database:
            migrations = apply_migrations(database_pool)
            created_admin = bootstrap_admin(database_pool, settings)
            if migrations:
                logger.info("Applied %d PostgreSQL migrations", len(migrations))
            if created_admin:
                logger.info("Bootstrapped the configured SafariDesk administrator")
        app.state.pool = database_pool
        app.state.settings = settings
        yield
        if owns_pool:
            database_pool.close()

    app = FastAPI(
        title="SafariDesk API",
        version="2.0.0",
        description="Python API backed by PostgreSQL. Development mock responses are disabled.",
        lifespan=lifespan,
    )
    app.state.pool = database_pool
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next: Any) -> Any:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if request.url.scheme == "https" or settings.cookie_secure:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response

    @app.exception_handler(ApiError)
    async def api_error_handler(_request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content={"error": exc.message, "code": exc.code})

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        if isinstance(exc.detail, dict):
            content = exc.detail
        else:
            content = {"error": str(exc.detail), "code": "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR"}
        return JSONResponse(status_code=exc.status_code, content=content, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_request: Request, _exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"error": "Validation failed.", "code": "VALIDATION"})

    @app.exception_handler(Exception)
    async def unhandled_error_handler(_request: Request, exc: Exception) -> JSONResponse:
        logger.error("Unhandled API error (%s)", type(exc).__name__)
        return JSONResponse(status_code=500, content={"error": "Internal server error.", "code": "INTERNAL"})

    @app.get("/health")
    def health() -> dict[str, Any]:
        try:
            with database_pool.connection() as conn:
                conn.execute("SELECT 1")
            return {"ok": True, "database": "postgresql", "mockData": False}
        except Exception:
            return JSONResponse(
                status_code=503,
                content={"ok": False, "database": "unavailable", "mockData": False},
            )

    auth_router, users_router = build_auth_routers(
        database_pool,
        settings,
        lambda phone, body, kind: send_sms(database_pool, settings, phone, body, kind),
    )
    app.include_router(auth_router)
    app.include_router(users_router)

    auth_dependency, permission_dependency_factory = build_auth_dependencies(database_pool, settings)
    app.include_router(
        build_domain_router(
            database_pool,
            settings,
            auth_dependency,
            permission_dependency_factory,
            lambda phone, body, kind="notification": send_sms(database_pool, settings, phone, body, kind),
        )
    )
    app.include_router(build_telecom_router(database_pool, settings, sms_sender=send_sms))
    return app


app = create_app()

socket_server = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=list(default_settings.cors_origins),
    logger=False,
    engineio_logger=False,
)


@socket_server.event
async def connect(_sid: str, _environ: dict[str, Any], _auth: Any = None) -> bool:
    # The current UI uses realtime only for non-sensitive refresh notifications.
    # No business data is sent on connection or broadcast to anonymous clients.
    return True


socket_app = socketio.ASGIApp(socket_server, app, socketio_path="socket.io")
