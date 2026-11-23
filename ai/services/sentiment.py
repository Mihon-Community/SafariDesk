"""Feedback sentiment: lexicon rules first, topics by keyword, LLM optional polish."""

from __future__ import annotations

import re
from typing import Literal

from schemas import SentimentRequest, SentimentResponse

_POSITIVE = ("great", "good", "loved", "amazing", "excellent", "fantastic", "beautiful", "asante", "nice", "happy", "enjoy")
_NEGATIVE = ("bad", "poor", "late", "dirty", "rude", "broken", "hot", "cold", "expensive", "disappointed", "hated", "worst")
_TOPICS = {
    "driver": ("driver", "guide"),
    "vehicle": ("car", "vehicle", "landcruiser", "van", "wheel"),
    "wildlife": ("lion", "elephant", "animal", "game", "migration", "big five"),
    "food": ("food", "lunch", "breakfast", "meal"),
    "accommodation": ("hotel", "room", "lodge", "bed"),
}


def analyse(text: str) -> SentimentResponse:
    words = set(re.findall(r"[a-z]+", text.lower()))
    pos = len(words & set(_POSITIVE))
    neg = len(words & set(_NEGATIVE))
    score = (pos - neg) / max(len(words), 1)
    if pos > neg:
        sentiment: Literal["positive", "neutral", "negative"] = "positive"
    elif neg > pos:
        sentiment = "negative"
    else:
        sentiment = "neutral"

    topics = [name for name, keys in _TOPICS.items() if any(k in text.lower() for k in keys)]
    return SentimentResponse(sentiment=sentiment, score=round(score, 3), topics=topics)


def sentiment_of(req: SentimentRequest) -> SentimentResponse:
    return analyse(req.text)
