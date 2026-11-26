CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL,
    password_hash text,
    role text NOT NULL CHECK (role IN ('super_admin','admin','operations','dispatcher','finance','agent','driver','customer')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','pending','disabled')),
    requested_role text CHECK (requested_role IS NULL OR requested_role IN ('operations','dispatcher','finance','agent','driver')),
    phone text,
    licence_number text,
    vehicle_reg text,
    company text,
    failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    locked_until timestamptz,
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_role_status_idx ON users (role, status);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_hash text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id uuid NOT NULL,
    user_agent text,
    ip inet,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    replaced_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_family_id_idx ON refresh_tokens(family_id);

CREATE TABLE IF NOT EXISTS password_resets (
    token_hash text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_resets_user_id_idx ON password_resets(user_id);

CREATE TABLE IF NOT EXISTS invites (
    token_hash text PRIMARY KEY,
    email text NOT NULL,
    phone text,
    role text NOT NULL CHECK (role IN ('super_admin','admin','operations','dispatcher','finance','agent','driver','customer')),
    invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
    expires_at timestamptz NOT NULL,
    accepted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invites_email_idx ON invites(lower(email));
CREATE INDEX IF NOT EXISTS invites_invited_by_idx ON invites(invited_by);

CREATE TABLE IF NOT EXISTS audit_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
    action text NOT NULL,
    target text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    ip inet,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_id_idx ON audit_log(actor_id, created_at DESC);
