from __future__ import annotations

import uuid
from typing import Any

from psycopg_pool import ConnectionPool

from .auth import _audit, _find_user_by_email, _hash_password


def bootstrap_admin(pool: ConnectionPool, settings: Any) -> bool:
    """Create one configured administrator when the database has no such row.

    No sample or role-demo accounts are inserted. Existing accounts/passwords
    are never overwritten on restart.
    """
    email = str(settings.admin_email).strip().lower()
    password = str(settings.admin_password)
    if not email or not password:
        raise RuntimeError("ADMIN_EMAIL and ADMIN_PASSWORD are required to bootstrap the first admin.")

    with pool.connection() as conn:
        existing = _find_user_by_email(conn, email)
        if existing:
            return False
        user_id = uuid.uuid4()
        name = str(settings.admin_name or "SafariDesk Admin").strip() or "SafariDesk Admin"
        user = conn.execute(
            """INSERT INTO users (id, name, email, password_hash, role, status)
               VALUES (%s, %s, %s, %s, 'admin', 'active')
               RETURNING id""",
            (user_id, name, email, _hash_password(password)),
        ).fetchone()
        if user:
            _audit(conn, str(user_id), "auth.admin_bootstrap", email, {"role": "admin"}, None)
    return True

