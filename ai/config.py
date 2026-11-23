"""Configuration for the AI sidecar. Secrets come from the environment only."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    port: int = 8001
    host: str = "127.0.0.1"
    # Comma-separated origins allowed to call the service directly.
    cors_origins: tuple[str, ...] = ("http://localhost:3000", "http://localhost:3001")
    # OpenAI-compatible endpoint (Groq by default) — optional.
    llm_api_key: str | None = None
    llm_base_url: str = "https://api.groq.com/openai/v1"
    llm_model: str = "llama-3.3-70b-versatile"
    request_timeout: float = 6.0

    @classmethod
    def from_env(cls) -> "Settings":
        raw_origins = os.getenv("AI_CORS_ORIGINS", cls.cors_origins[0])
        return cls(
            port=int(os.getenv("AI_PORT", cls.port)),
            host=os.getenv("AI_HOST", cls.host),
            cors_origins=tuple(o.strip() for o in raw_origins.split(",") if o.strip()),
            llm_api_key=os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY"),
            llm_base_url=os.getenv("LLM_BASE_URL", cls.llm_base_url),
            llm_model=os.getenv("LLM_MODEL", cls.llm_model),
            request_timeout=float(os.getenv("AI_LLM_TIMEOUT", cls.request_timeout)),
        )
