# SafariDesk AI service

Python **FastAPI** sidecar for the SafariDesk AI layer. The Express backend proxies
`/api/ai/*` to this service; the Next.js app can also call it directly through
`NEXT_PUBLIC_AI_URL`.

Everything is **rule/template first and LLM optional**: with no API key the service
still answers from the FAQ, templates and heuristics. A Groq (or any
OpenAI-compatible) key only polishes alert titles and itinerary wording.

## Run

```bash
cd ai
py -3.14 -m venv .venv            # or: python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.txt
./.venv/Scripts/python.exe -m uvicorn app:app --reload --port 8001
```

Interactive docs at http://127.0.0.1:8001/docs.

## Tests

```bash
./.venv/Scripts/python.exe -m pytest -q     # 11 tests, no LLM required
```

## Environment

| Variable | Purpose | Default |
|---|---|---|
| `AI_PORT` / `AI_HOST` | Bind address | `8001` / `127.0.0.1` |
| `AI_CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:3000` |
| `LLM_API_KEY` | OpenAI-compatible key (Groq) — optional | unset |
| `LLM_BASE_URL` | API base | `https://api.groq.com/openai/v1` |
| `LLM_MODEL` | Model name | `llama-3.3-70b-versatile` |

## Endpoints (mounted under `/api/ai`)

| Endpoint | What it does |
|---|---|
| `GET /health` | Liveness plus whether an LLM key is configured |
| `POST /draft-alert` | Classifies type/severity, drafts English + Swahili (≤160/200 chars) |
| `POST /concierge` | Keyword FAQ first (`data/faq.md`), LLM second, SMS-length replies, EN/SW detection |
| `POST /itinerary` | Day-by-day template itinerary, optional LLM title polish |
| `POST /forecast` | 3-month simple moving average with a confidence band |
| `POST /anomalies` | Duplicate M-Pesa refs, amount conflicts, repeat failures, capacity flags |
| `POST /sentiment` | Lexicon sentiment + topics for feedback |
| `POST /parse-booking` | `"2 pax Mara 3 days 20 Dec resident"` → structured booking + confidence |

## Guardrails

- The model never sets prices and never decides money; the rate engine owns pricing.
- Alert output is draft-only: the operator approves in the dashboard before sending.
- Structured responses are validated with Pydantic; failures fall back to templates,
  so an LLM outage degrades quality but not availability.
