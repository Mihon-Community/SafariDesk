"""Safety-alert drafting and translation. Draft-only: a human approves before send."""

from __future__ import annotations

import re

from schemas import DraftAlertRequest, DraftAlertResponse, Severity
from services.llm import LLM

TYPES = {
    "road": "Road closure",
    "weather": "Weather warning",
    "wildlife": "Wildlife sighting",
    "health": "Health notice",
    "park": "Park advisory",
}

SWAHILI = {
    "INFO": "Taarifa",
    "WARNING": "Onyo",
    "CRITICAL": "Hatua ya dharura",
}


def classify(description: str) -> tuple[str, Severity]:
    text = description.lower()
    if any(w in text for w in ("closed", "closure", "flood", "bridge")):
        kind = "Road closure"
    elif any(w in text for w in ("rain", "storm", "wind", "heat", "weather")):
        kind = "Weather warning"
    elif any(w in text for w in ("lion", "elephant", "animal", "buffalo", "snake")):
        kind = "Wildlife sighting"
    elif any(w in text for w in ("clinic", "hospital", "malaria", "health", "injury")):
        kind = "Health notice"
    else:
        kind = "Park advisory"

    if any(w in text for w in ("urgent", "emergency", "evacuat", "danger", "critical", "attack")):
        severity: Severity = "CRITICAL"
    elif any(w in text for w in ("warning", "caution", "closed", "delay", "slippery")):
        severity = "WARNING"
    else:
        severity = "INFO"
    return kind, severity


def _english(description: str, kind: str, severity: Severity) -> str:
    clean = description.strip().rstrip(".")
    return (
        f"[{severity}] {kind}: {clean}. "
        "Please follow crew instructions, stay with your group and keep calm."
    )


def _swahili(description: str, kind: str, severity: Severity) -> str:
    clean = description.strip().rstrip(".")
    return (
        f"[{SWAHILI.get(severity, severity)}] {kind}: {clean}. "
        "Tafadhali fuata maagizo ya wafanyakazi, kaa na kikundi chako na usipate wasiwasi."
    )


async def draft_alert(req: DraftAlertRequest, llm: LLM, recipient_count: int = 0) -> DraftAlertResponse:
    detected_kind, detected_severity = classify(req.description)
    kind = req.type or detected_kind
    severity = req.severity or detected_severity

    model = await llm.complete_json(
        system=(
            "You write short safari safety alerts for guests on active trips in Kenya. "
            "Return JSON: {\"english\": string<=160 chars, \"swahili\": string<=200 chars}. "
            "Never invent prices or availability."
        ),
        prompt=req.description,
    )
    if isinstance(model, dict) and model.get("english"):
        english = str(model["english"])[:160]
        swahili = str(model.get("swahili") or "")[:200] or _swahili(req.description, kind, severity)
        source = "llm"
    else:
        english = _english(req.description, kind, severity)
        swahili = _swahili(req.description, kind, severity)
        source = "template"

    return DraftAlertResponse(
        type=kind,
        severity=severity,
        english=english,
        swahili=swahili,
        recipient_count=recipient_count,
        source=source,
    )
