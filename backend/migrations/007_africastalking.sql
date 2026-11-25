-- Africa's Talking callbacks and message state. Raw callback message text and
-- phone numbers are not stored here; phone references are keyed hashes.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_e164 TEXT;
CREATE INDEX IF NOT EXISTS idx_users_phone_e164
  ON users(phone_e164) WHERE phone_e164 IS NOT NULL;

ALTER TABLE invites ADD COLUMN IF NOT EXISTS phone_e164 TEXT;

CREATE TABLE IF NOT EXISTS at_inbound_sms (
  provider_message_id TEXT PRIMARY KEY,
  sender_hash CHAR(64) NOT NULL,
  command TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS at_sms_preferences (
  phone_hash CHAR(64) PRIMARY KEY,
  opted_out BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS at_sms_messages (
  provider_message_id TEXT PRIMARY KEY,
  recipient_hash CHAR(64),
  api_status TEXT,
  api_status_code INTEGER,
  cost TEXT,
  delivery_status TEXT,
  failure_reason TEXT,
  network_code TEXT,
  submitted_at TIMESTAMPTZ,
  report_received_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS at_ussd_sessions (
  session_id TEXT PRIMARY KEY,
  phone_hash CHAR(64) NOT NULL,
  service_code TEXT NOT NULL,
  input_text TEXT NOT NULL,
  response_text TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_at_ussd_sessions_expiry ON at_ussd_sessions(expires_at);
