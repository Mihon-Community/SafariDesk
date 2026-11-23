"""SafariDesk AI service — FastAPI sidecar.

Run from this directory:
    uvicorn app:app --reload
The Express backend proxies `/api/ai/*` here; the dashboard can also reach it
directly through `NEXT_PUBLIC_AI_URL`. Everything works without an LLM key:
rules and templates produce safe output, the model is an optional polish layer,
and money never comes from the model (the rate engine owns pricing).
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import Settings
from routes import router

settings = Settings.from_env()

app = FastAPI(
    title="SafariDesk AI",
    version="1.0.0",
    description="Drafting, concierge, forecast and parsing for SafariDesk",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    return {"service": "safaridesk-ai", "docs": "/docs"}
