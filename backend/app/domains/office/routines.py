"""Traduce el estado de un agente a un destino de la oficina (sección 11.4)."""

from typing import Any

DEFAULT_RULES: dict[str, str] = {
    "thinking": "workplace",
    "working": "workplace",
    "reviewing": "workplace",
    "waiting_approval": "workplace",
    "reading": "cabinet",
    "meeting": "boardroom",
    "resting": "break",
}


def destination(rules: dict[str, Any], status: str, tool: str | None) -> str | None:
    merged = {**DEFAULT_RULES, **rules}
    if status == "working" and tool in {"read_file", "search_files"}:
        return str(merged["reading"])
    target = merged.get(status)
    return str(target) if target else None
