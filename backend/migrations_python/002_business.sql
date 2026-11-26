-- Operational records are created through the API. Migration 004 seeds only
-- public destination reference rows; no bookings, guests, prices, or inventory.
CREATE TABLE IF NOT EXISTS business_records (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    record_type text NOT NULL CHECK (record_type IN (
        'parks','packages','park_fees','seasons','drivers','vehicles','guests',
        'bookings','payments','assignments','alerts','deliveries','feedback'
    )),
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_records_type_updated_idx
    ON business_records(record_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS business_records_booking_status_start_idx
    ON business_records((payload->>'status'), (payload->>'startDate'))
    WHERE record_type = 'bookings';
CREATE INDEX IF NOT EXISTS business_records_booking_phone_idx
    ON business_records((payload->>'phone'))
    WHERE record_type = 'bookings';
CREATE INDEX IF NOT EXISTS business_records_assignment_booking_idx
    ON business_records((payload->>'bookingId'))
    WHERE record_type = 'assignments';

CREATE TABLE IF NOT EXISTS payments_reconciliation_runs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source text NOT NULL,
    status text NOT NULL CHECK (status IN ('started','completed','failed')),
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS reconciliation_runs_started_idx
    ON payments_reconciliation_runs(started_at DESC);
