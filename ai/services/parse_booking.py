"""Free-text SMS booking parser: '2 pax Mara 3 days 20 Dec resident' -> structure."""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Literal

from schemas import ParsedBooking

PARKS = [
    ("maasai mara", "Maasai Mara"),
    ("mara", "Maasai Mara"),
    ("amboseli", "Amboseli"),
    ("tsavo", "Tsavo East"),
    ("samburu", "Samburu"),
    ("nakuru", "Lake Nakuru"),
    ("nairobi", "Nairobi National Park"),
    ("serengeti", "Serengeti"),
    ("ngorongoro", "Ngorongoro"),
]

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

RESIDENCY = {
    "citizen": "citizen",
    "resident": "resident",
    "non resident": "non_resident",
    "non-resident": "non_resident",
    "nonresident": "non_resident",
    "tourist": "non_resident",
    "foreigner": "non_resident",
}


def parse_booking(text: str) -> ParsedBooking:
    lower = text.lower()

    park = None
    for needle, canonical in PARKS:
        if needle in lower:
            park = canonical
            break

    pax_m = re.search(r"\b(\d{1,2})\s*(?:pax|people|persons|guest)", lower)
    if not pax_m:
        pax_m = re.search(r"\b(\d{1,2})\s+p\b", lower)
    pax = int(pax_m.group(1)) if pax_m else None

    days_m = re.search(r"\b(\d{1,2})\s*(?:days?|nights?)", lower)
    days = int(days_m.group(1)) if days_m else None

    residency: Literal["citizen", "resident", "non_resident"] | None = None
    for needle, canonical in RESIDENCY.items():
        if needle in lower:
            residency = canonical  # type: ignore[assignment]
            break

    trip_date = None
    # "20 Dec", "20 December" or "Dec 20"
    match = re.search(
        r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*",
        lower,
    ) or re.search(
        r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?",
        lower,
    )
    if match:
        groups = match.groups()
        if groups[0].isdigit():
            day, month_name = int(groups[0]), groups[1]
        else:
            month_name, day = groups[0], int(groups[1])
        month = MONTHS.get(month_name)
        if month:
            try:
                trip_date = date(date.today().year, month, day).isoformat()
            except ValueError:
                trip_date = None

    hits = sum(v is not None for v in (park, pax, days, residency))
    confidence = min(0.95, 0.2 + 0.18 * hits + (0.2 if trip_date else 0))
    return ParsedBooking(park=park, pax=pax, days=days, residency=residency, date=trip_date, confidence=round(confidence, 2))
