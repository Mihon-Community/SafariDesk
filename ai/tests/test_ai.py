"""Tests for the SafariDesk AI sidecar (run from the `ai/` directory)."""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from app import app  # noqa: E402


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def test_health(client: TestClient) -> None:
    res = client.get("/api/ai/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["llm"] in (True, False)


def test_draft_alert_classifies_and_bounds_length(client: TestClient) -> None:
    res = client.post(
        "/api/ai/draft-alert",
        json={"description": "Mara River road closed after heavy rain, use Sekenani gate"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["type"] == "Road closure"
    assert body["severity"] in ("WARNING", "CRITICAL")
    assert len(body["english"]) <= 220
    assert body["swahili"]
    assert body["source"] in ("template", "llm")


def test_draft_alert_critical_keywords(client: TestClient) -> None:
    body = client.post(
        "/api/ai/draft-alert", json={"description": "URGENT: elephant near camp, evacuate now"}
    ).json()
    assert body["severity"] == "CRITICAL"


def test_concierge_keyword_answer(client: TestClient) -> None:
    res = client.post("/api/ai/concierge", json={"message": "What should I pack for the Mara?"})
    body = res.json()
    assert body["source"] == "keyword"
    assert len(body["reply"]) <= 160
    assert "warm layer" in body["reply"].lower()


def test_concierge_detects_swahili(client: TestClient) -> None:
    body = client.post("/api/ai/concierge", json={"message": "Habari, asante sana"}).json()
    assert body["language"] == "sw"


def test_itinerary_template_days(client: TestClient) -> None:
    body = client.post(
        "/api/ai/itinerary", json={"package_name": "Maasai Mara 3 days", "days": 3, "park_name": "Maasai Mara", "pax": 2}
    ).json()
    assert len(body["days"]) == 3
    assert [d["day"] for d in body["days"]] == [1, 2, 3]
    assert "Mara" in body["title"]


def test_forecast_shape_and_band(client: TestClient) -> None:
    body = client.post(
        "/api/ai/forecast",
        json={"months": ["2026-06", "2026-07", "2026-08", "2026-09"], "bookings": [10, 12, 9, 14]},
    ).json()
    assert body["method"] == "sma3"
    assert len(body["points"]) == 7  # 4 history + 3 projected
    future = [p for p in body["points"] if p["month"] > "2026-09"]
    assert len(future) == 3
    assert all(p["lower"] <= p["forecast"] <= p["upper"] for p in future)


def test_anomalies_duplicate_reference(client: TestClient) -> None:
    rows = [
        {"id": 1, "mpesaRef": "QNH1", "amount": 500, "status": "SUCCESS", "phone": "+254700000001"},
        {"id": 2, "mpesaRef": "QNH1", "amount": 500, "status": "SUCCESS", "phone": "+254700000002"},
    ]
    body = client.post("/api/ai/anomalies", json={"kind": "payments", "rows": rows}).json()
    assert any("Duplicate" in a["reason"] for a in body["anomalies"])


def test_sentiment_lexicon(client: TestClient) -> None:
    pos = client.post("/api/ai/sentiment", json={"text": "Great drive, saw the big five, amazing guide"}).json()
    neg = client.post("/api/ai/sentiment", json={"text": "The car was hot and the driver was rude"}).json()
    assert pos["sentiment"] == "positive"
    assert neg["sentiment"] == "negative"
    assert "wildlife" in pos["topics"]
    assert "vehicle" in neg["topics"] or "driver" in neg["topics"]


def test_parse_booking_sms(client: TestClient) -> None:
    body = client.post("/api/ai/parse-booking", json={"text": "2 pax Mara 3 days 20 Dec resident"}).json()
    assert body["park"] == "Maasai Mara"
    assert body["pax"] == 2
    assert body["days"] == 3
    assert body["residency"] == "resident"
    assert body["date"] == f"{__import__('datetime').date.today().year}-12-20"
    assert body["confidence"] > 0.5


def test_llm_absent_means_templates(client: TestClient) -> None:
    if os.getenv("LLM_API_KEY"):
        pytest.skip("LLM configured")
    body = client.post("/api/ai/draft-alert", json={"description": "Test alert about rain"}).json()
    assert body["source"] == "template"
