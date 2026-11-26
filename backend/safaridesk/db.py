from __future__ import annotations

from pathlib import Path

from psycopg_pool import ConnectionPool

from .config import BACKEND_DIR, Settings

MIGRATIONS_DIR = BACKEND_DIR / "migrations_python"


def create_pool(settings: Settings) -> ConnectionPool:
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is required. SafariDesk no longer falls back to in-memory storage.")
    return ConnectionPool(
        conninfo=settings.database_url,
        min_size=1,
        max_size=10,
        timeout=10,
        open=False,
        kwargs={"application_name": "safaridesk-api"},
    )


def apply_migrations(pool: ConnectionPool, directory: Path = MIGRATIONS_DIR) -> list[str]:
    with pool.connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename text PRIMARY KEY,
                applied_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )

    applied_now: list[str] = []
    for path in sorted(directory.glob("*.sql")):
        with pool.connection() as conn:
            exists = conn.execute(
                "SELECT 1 FROM schema_migrations WHERE filename = %s",
                (path.name,),
            ).fetchone()
        if exists:
            continue

        sql = path.read_text(encoding="utf-8")
        with pool.connection() as conn, conn.transaction():
            conn.execute(sql)
            conn.execute("INSERT INTO schema_migrations(filename) VALUES (%s)", (path.name,))
        applied_now.append(path.name)
    return applied_now
