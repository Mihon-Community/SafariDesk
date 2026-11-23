"""AI endpoints exposed to the Express proxy (`/api/ai/*`)."""

from __future__ import annotations

from fastapi import APIRouter

from config import Settings
from schemas import (
    AnomalyInput,
    AnomalyResponse,
    ConciergeRequest,
    ConciergeResponse,
    DraftAlertRequest,
    DraftAlertResponse,
    ForecastRequest,
    ForecastResponse,
    HealthResponse,
    ItineraryRequest,
    ItineraryResponse,
    ParseBookingRequest,
    ParsedBooking,
    SentimentRequest,
    SentimentResponse,
)
from services import (
    anomalies,
    concierge,
    draft_alert,
    forecast,
    itinerary,
    parse_booking,
    sentiment,
)
from services.llm import LLM

router = APIRouter(prefix="/api/ai", tags=["ai"])

# One LLM client per process; availability is decided by the environment.
settings = Settings.from_env()
llm = LLM(settings)


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(ok=True, llm=llm.available)


@router.post("/draft-alert", response_model=DraftAlertResponse)
async def draft_alert_endpoint(req: DraftAlertRequest) -> DraftAlertResponse:
    return await draft_alert.draft_alert(req, llm)


@router.post("/concierge", response_model=ConciergeResponse)
async def concierge_endpoint(req: ConciergeRequest) -> ConciergeResponse:
    return await concierge.concierge_reply(req, llm)


@router.post("/itinerary", response_model=ItineraryResponse)
async def itinerary_endpoint(req: ItineraryRequest) -> ItineraryResponse:
    return await itinerary.build_itinerary(req, llm)


@router.post("/forecast", response_model=ForecastResponse)
async def forecast_endpoint(req: ForecastRequest) -> ForecastResponse:
    return forecast.forecast(req)


@router.post("/anomalies", response_model=AnomalyResponse)
async def anomalies_endpoint(req: AnomalyInput) -> AnomalyResponse:
    return anomalies.detect_anomalies(req)


@router.post("/sentiment", response_model=SentimentResponse)
async def sentiment_endpoint(req: SentimentRequest) -> SentimentResponse:
    return sentiment.sentiment_of(req)


@router.post("/parse-booking", response_model=ParsedBooking)
async def parse_booking_endpoint(req: ParseBookingRequest) -> ParsedBooking:
    return parse_booking.parse_booking(req.text)
