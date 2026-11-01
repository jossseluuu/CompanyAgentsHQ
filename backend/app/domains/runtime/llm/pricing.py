"""Precios en USD por millón de tokens (entrada, salida). Los modelos locales no cuestan nada."""

from decimal import Decimal

from app.core.config import get_settings

PRICES: dict[str, tuple[float, float]] = {
    "claude-fable-5-1": (10, 50),
    "claude-opus-5-5": (4, 20),
    "claude-sonnet-5-5": (2, 10),
    "claude-haiku-5-5": (0.10, 0.50),
    "fake": (1, 5),
}


def cost_eur(model: str, input_tokens: int, output_tokens: int) -> Decimal:
    base = model.split(":", 1)[-1]
    prices = PRICES.get(base)
    if prices is None:
        return Decimal(0)
    usd = (input_tokens * prices[0] + output_tokens * prices[1]) / 1_000_000
    return Decimal(str(round(usd * get_settings().usd_to_eur, 6)))
