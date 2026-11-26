CREATE TABLE IF NOT EXISTS ussd_sessions (
    session_id text PRIMARY KEY,
    phone_hash char(64) NOT NULL,
    service_code text NOT NULL,
    state jsonb NOT NULL DEFAULT '{}'::jsonb,
    expires_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ussd_sessions_expiry_idx ON ussd_sessions(expires_at);

CREATE TABLE IF NOT EXISTS sms_messages (
    id uuid PRIMARY KEY,
    provider_message_id text,
    recipient_hash char(64) NOT NULL,
    event_kind text NOT NULL,
    api_status text NOT NULL DEFAULT 'Pending',
    api_status_code integer,
    cost text,
    delivery_status text,
    failure_reason text,
    network_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sms_messages_provider_id_unique
    ON sms_messages(provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sms_messages_recipient_created_idx ON sms_messages(recipient_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS sms_messages_delivery_idx ON sms_messages(delivery_status, created_at DESC);

CREATE TABLE IF NOT EXISTS sms_inbound (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider_message_id text,
    sender_hash char(64) NOT NULL,
    command text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sms_inbound_provider_id_unique
    ON sms_inbound(provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sms_inbound_sender_created_idx ON sms_inbound(sender_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS sms_opt_outs (
    phone_hash text PRIMARY KEY,
    opted_out_at timestamptz NOT NULL DEFAULT now()
);
