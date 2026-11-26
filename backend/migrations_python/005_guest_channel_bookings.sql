CREATE TABLE IF NOT EXISTS sms_booking_sessions (
    phone_hash text PRIMARY KEY CHECK (phone_hash ~ '^[0-9a-f]{64}$'),
    state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
    expires_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_booking_sessions_expiry_idx
    ON sms_booking_sessions(expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS business_records_payments_provider_ref_unique
    ON business_records ((payload->>'providerRef'))
    WHERE record_type = 'payments'
      AND payload ? 'providerRef'
      AND payload->>'providerRef' IS NOT NULL;
