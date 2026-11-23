"""Keyword-first guest concierge (data/faq.md), LLM second. Under 160 characters."""

from __future__ import annotations

import os
import re
from typing import Literal

from schemas import ConciergeRequest, ConciergeResponse
from services.llm import LLM

FAQ_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "faq.md")

_SWAHILI_HINTS = ("swahili", "kiswahili", "asante", "jambo", "habari", "tafadhali", "nakupenda")


def detect_language(message: str) -> Literal["en", "sw"]:
    return "sw" if any(h in message.lower() for h in _SWAHILI_HINTS) else "en"


def load_faq() -> list[tuple[str, str]]:
    """Parse `data/faq.md` entries shaped as `### Question` + body sentence."""
    try:
        with open(FAQ_PATH, encoding="utf-8") as fh:
            text = fh.read()
    except OSError:
        return []
    pairs: list[tuple[str, str]] = []
    question: str | None = None
    for line in text.splitlines():
        if line.startswith("### "):
            question = line[4:].strip()
        elif question and line.strip() and not line.startswith("#"):
            pairs.append((question, line.strip()))
            question = None
    return pairs


def keyword_answer(message: str, language: str) -> str | None:
    faq = load_faq()
    if not faq:
        return None
    words = set(re.findall(r"[a-z]{4,}", message.lower()))
    best: tuple[int, str] | None = None
    for question, answer in faq:
        tokens = set(re.findall(r"[a-z]{4,}", (question + " " + answer).lower()))
        score = len(words & tokens)
        if score and (best is None or score > best[0]):
            best = (score, answer)
    if not best:
        return None
    answer = best[1]
    if language == "sw":
        answer = answer + " (Kiswahili: tafadhali uliza kwa simu ya uendeshaji.)"
    return answer[:158]


async def concierge_reply(req: ConciergeRequest, llm: LLM) -> ConciergeResponse:
    language: Literal["en", "sw"] = req.language or detect_language(req.message)

    hit = keyword_answer(req.message, language)
    if hit:
        return ConciergeResponse(reply=hit, language=language, source="keyword")

    text = await llm.complete_text(
        system=(
            "You are SafariDesk's guest concierge for Kenyan safaris. Answer in under "
            "150 characters, plain SMS style, no prices unless asked rates are unknown."
        ),
        prompt=req.message,
        max_chars=158,
    )
    if text:
        return ConciergeResponse(reply=text, language=language, source="llm")

    fallback = (
        "Thank you! Call our team on the emergency number in your itinerary for urgent help."
        if language == "en"
        else "Asante! Pigia simu timu yetu kwa msaada wa haraka."
    )
    return ConciergeResponse(reply=fallback[:158], language=language, source="fallback")
