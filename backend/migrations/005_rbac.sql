-- Phase 8 RBAC rollout: rename the legacy staff role to operations, and give
-- the new roles their CHECK constraints (idempotent).
UPDATE users SET role = 'operations' WHERE role = 'staff';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin','admin','operations','dispatcher','finance','agent','driver','customer'));

ALTER TABLE invites DROP CONSTRAINT IF EXISTS invites_role_check;
ALTER TABLE invites ADD CONSTRAINT invites_role_check
  CHECK (role IN ('super_admin','admin','operations','dispatcher','finance','agent','driver'));
