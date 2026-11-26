-- Seed a small public destination directory for first-run presentations.
-- These are real destinations only: no package, price, booking, or guest data.
WITH destinations(sort_order, name) AS (
    VALUES
        (1, 'Maasai Mara'),
        (2, 'Amboseli'),
        (3, 'Tsavo East'),
        (4, 'Nairobi National Park')
)
INSERT INTO business_records (record_type, payload)
SELECT 'parks', jsonb_build_object('name', destinations.name)
FROM destinations
WHERE NOT EXISTS (
    SELECT 1
    FROM business_records existing
    WHERE existing.record_type = 'parks'
      AND lower(existing.payload->>'name') = lower(destinations.name)
)
ORDER BY destinations.sort_order;
