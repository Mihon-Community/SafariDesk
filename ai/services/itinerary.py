"""Template-first day-by-day itinerary; the LLM may polish titles only."""

from __future__ import annotations

from schemas import ItineraryDay, ItineraryRequest, ItineraryResponse
from services.llm import LLM

ACTIVITIES = [
    ("Arrival & orientation", "Check in, meet your driver-guide and take a relaxed afternoon game drive."),
    ("Full-day game drive", "Early departure with a picnic lunch; big cats and herds along the river."),
    ("Community & culture", "Visit a Maasai village or local project, then a sunset stop at a viewpoint."),
    ("Special interest", "Birding, photography hides or a guided nature walk, tailored on the day."),
    ("Departure", "Final morning drive to catch the light, then drop-off before lunch."),
]


def template_days(days: int, park: str | None) -> list[ItineraryDay]:
    park_label = park or "the park"
    out: list[ItineraryDay] = []
    for i in range(days):
        title, detail = ACTIVITIES[min(i, len(ACTIVITIES) - 1)]
        suffix = "" if i < len(ACTIVITIES) - 1 else ""
        out.append(
            ItineraryDay(
                day=i + 1,
                title=title,
                detail=f"{detail} Around {park_label}.{suffix}".strip(),
            )
        )
    return out


async def build_itinerary(req: ItineraryRequest, llm: LLM) -> ItineraryResponse:
    days = template_days(req.days, req.park_name)
    title = f"{req.package_name or (req.park_name or 'Safari')} — {req.days}-day itinerary"

    polished = await llm.complete_json(
        system="Return JSON {\"title\": string<=60 chars}. No prices, no invented wildlife facts.",
        prompt=f"Suggest a friendly title for a {req.days}-day safari itinerary"
        + (f" in {req.park_name}" if req.park_name else ""),
    )
    if isinstance(polished, dict) and polished.get("title"):
        title = str(polished["title"])[:60]

    return ItineraryResponse(title=title, days=days, source="llm" if polished else "template")
