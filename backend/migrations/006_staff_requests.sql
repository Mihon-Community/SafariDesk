-- Phase 9 (finish-up): staff-role requests at self-signup.
-- Pending requesters keep role=customer with status='pending' and a
-- requested_role; an admin approves (grant role) or reject (disable).

ALTER TABLE users ADD COLUMN IF NOT EXISTS requested_role TEXT;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('active', 'invited', 'pending', 'disabled'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_requested_role_check;
ALTER TABLE users ADD CONSTRAINT users_requested_role_check
  CHECK (requested_role IS NULL OR requested_role IN
    ('super_admin','admin','operations','dispatcher','finance','agent','driver','customer'));

CREATE INDEX IF NOT EXISTS idx_users_pending ON users(status) WHERE status = 'pending';
