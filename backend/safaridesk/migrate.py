from __future__ import annotations

from .config import settings
from .db import apply_migrations, create_pool


def main() -> int:
    pool = create_pool(settings)
    try:
        pool.open(wait=True)
        applied = apply_migrations(pool)
        if applied:
            print("Applied migrations: " + ", ".join(applied))
        else:
            print("Database schema is up to date.")
        return 0
    finally:
        pool.close()


if __name__ == "__main__":
    raise SystemExit(main())
