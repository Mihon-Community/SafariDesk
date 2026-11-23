"""Indicative demand forecast: 3-month simple moving average with a band."""

from __future__ import annotations

import statistics

from schemas import ForecastPoint, ForecastRequest, ForecastResponse


def _months_ahead(months: list[str], count: int) -> list[str]:
    """Extend YYYY-MM labels forward from the last month."""
    year, month = (int(x) for x in months[-1].split("-"))
    out = []
    for _ in range(count):
        month += 1
        if month > 12:
            month = 1
            year += 1
        out.append(f"{year:04d}-{month:02d}")
    return out


def forecast(req: ForecastRequest) -> ForecastResponse:
    series = [float(v) for v in req.bookings]
    window = min(3, len(series))
    points: list[ForecastPoint] = []

    # history, with a fitted value and band where enough data exists
    for i, month in enumerate(req.months):
        point = ForecastPoint(month=month, bookings=series[i])
        if i >= window - 1:
            sma = sum(series[i - window + 1 : i + 1]) / window
            spread = statistics.pstdev(series[max(0, i - window + 1) : i + 1]) or sma * 0.1
            point.forecast = round(sma, 1)
            point.lower = max(0.0, round(sma - spread, 1))
            point.upper = round(sma + spread, 1)
        points.append(point)

    # next three months, projected forward
    last = list(series[-window:])
    future_months = _months_ahead(req.months, 3)
    history = list(series)
    for month in future_months:
        sma = sum(last[-window:]) / window
        spread = statistics.pstdev(history[-window:]) or sma * 0.1
        points.append(
            ForecastPoint(
                month=month,
                bookings=0.0,
                forecast=round(sma, 1),
                lower=max(0.0, round(sma - spread, 1)),
                upper=round(sma + spread, 1),
            )
        )
        history.append(sma)
        last.append(sma)

    return ForecastResponse(points=points, method="sma3")
