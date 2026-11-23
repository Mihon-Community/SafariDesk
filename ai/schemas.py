"""Request/response contracts shared with the frontend and the Express proxy."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Severity = Literal["INFO", "WARNING", "CRITICAL"]


class DraftAlertRequest(BaseModel):
    description: str = Field(min_length=4, max_length=500)
    type: str | None = None
    severity: Severity | None = None
    park_id: int | None = None


class DraftAlertResponse(BaseModel):
    type: str
    severity: Severity
    english: str
    swahili: str
    recipient_count: int
    source: Literal["llm", "template"] = "template"


class ConciergeRequest(BaseModel):
    message: str = Field(min_length=1, max_length=400)
    language: Literal["en", "sw"] | None = None
    phone: str | None = None


class ConciergeResponse(BaseModel):
    reply: str
    language: Literal["en", "sw"]
    source: Literal["keyword", "llm", "fallback"]


class ItineraryRequest(BaseModel):
    package_name: str | None = None
    days: int = Field(default=3, ge=1, le=14)
    park_name: str | None = None
    pax: int = Field(default=2, ge=1, le=50)


class ItineraryDay(BaseModel):
    day: int
    title: str
    detail: str


class ItineraryResponse(BaseModel):
    title: str
    days: list[ItineraryDay]
    source: Literal["llm", "template"] = "template"


class ForecastPoint(BaseModel):
    month: str
    bookings: float
    forecast: float | None = None
    lower: float | None = None
    upper: float | None = None


class ForecastRequest(BaseModel):
    months: list[str]
    bookings: list[float] = Field(min_length=3)


class ForecastResponse(BaseModel):
    points: list[ForecastPoint]
    method: Literal["sma3", "llm"] = "sma3"


class AnomalyInput(BaseModel):
    kind: Literal["payments", "bookings"]
    rows: list[dict[str, Any]]


class Anomaly(BaseModel):
    id: Any
    kind: str
    reason: str
    severity: Severity = "WARNING"


class AnomalyResponse(BaseModel):
    anomalies: list[Anomaly]


class SentimentRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class SentimentResponse(BaseModel):
    sentiment: Literal["positive", "neutral", "negative"]
    score: float = Field(ge=-1, le=1)
    topics: list[str] = []


class ParseBookingRequest(BaseModel):
    text: str = Field(min_length=3, max_length=500)


class ParsedBooking(BaseModel):
    park: str | None = None
    pax: int | None = None
    days: int | None = None
    residency: Literal["citizen", "resident", "non_resident"] | None = None
    date: str | None = None
    confidence: float = Field(ge=0, le=1)


class HealthResponse(BaseModel):
    ok: bool
    llm: bool
    version: str = "1.0.0"
