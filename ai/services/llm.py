"""Optional OpenAI-compatible LLM client (Groq by default).

Every caller has a deterministic fallback, so the service is fully functional
without a key. The model is never used for prices or money decisions.
"""

from __future__ import annotations

import json

import httpx

from config import Settings


class LLM:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.available = bool(settings.llm_api_key)

    async def complete_json(self, system: str, prompt: str) -> dict | list | None:
        """Return parsed JSON from the model, or None when unavailable/failed."""
        if not self.available:
            return None
        payload = {
            "model": self.settings.llm_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.3,
            "response_format": {"type": "json_object"},
        }
        headers = {
            "Authorization": f"Bearer {self.settings.llm_api_key}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=self.settings.request_timeout) as client:
                res = await client.post(
                    f"{self.settings.llm_base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                res.raise_for_status()
                content = res.json()["choices"][0]["message"]["content"]
            return json.loads(content)
        except Exception:  # noqa: BLE001 - any failure falls back to templates
            return None

    async def complete_text(self, system: str, prompt: str, max_chars: int = 200) -> str | None:
        if not self.available:
            return None
        payload = {
            "model": self.settings.llm_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 80,
            "temperature": 0.4,
        }
        headers = {
            "Authorization": f"Bearer {self.settings.llm_api_key}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=self.settings.request_timeout) as client:
                res = await client.post(
                    f"{self.settings.llm_base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                res.raise_for_status()
                text = res.json()["choices"][0]["message"]["content"].strip()
            return text[:max_chars]
        except Exception:  # noqa: BLE001
            return None
