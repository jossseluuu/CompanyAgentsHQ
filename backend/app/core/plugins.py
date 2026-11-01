"""Registro de plugins: módulos de sala y herramientas se descubren sin tocar el núcleo (RNF-ESC-03)."""

import importlib
import pkgutil
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class FurnitureSpec:
    model_key: str
    dx: int
    dy: int
    rotation: int = 0
    interactive: bool = False


@dataclass
class KnowledgeSource:
    title: str
    build: Callable[[AsyncSession, uuid.UUID], Awaitable[str]]


@dataclass
class ToolContext:
    db: AsyncSession
    company_id: uuid.UUID
    agent: Any
    task: Any
    used_chunks: list[Any] = field(default_factory=list)


@dataclass
class ToolResult:
    content: str
    is_error: bool = False
    pause: bool = False  # la tarea queda bloqueada hasta una decisión externa
    done: bool = False  # termina el turno del agente (p. ej. plan propuesto)


@dataclass
class Tool:
    name: str
    description: str
    input_schema: dict[str, Any]
    run: Callable[[ToolContext, dict[str, Any]], Awaitable[ToolResult]]
    sensitive: bool = False  # requiere aprobación del dueño
    core: bool = False  # disponible en cualquier sala


class RoomModule(Protocol):
    key: str
    name: str
    description: str
    priority: str
    furniture: list[FurnitureSpec]
    ui_panel: str
    default_config: dict[str, Any]

    def tools(self) -> list[str]: ...
    def knowledge_sources(self) -> list[KnowledgeSource]: ...


class BaseRoomModule:
    key = ""
    name = ""
    description = ""
    priority = "M"
    furniture: list[FurnitureSpec] = []
    ui_panel = ""
    default_config: dict[str, Any] = {}
    tool_names: list[str] = []

    def tools(self) -> list[str]:
        return self.tool_names

    def knowledge_sources(self) -> list[KnowledgeSource]:
        return []


_modules: dict[str, RoomModule] = {}
_tools: dict[str, Tool] = {}


def discover() -> None:
    """Carga cada subpaquete de room_modules y cada fichero de tools."""
    import app.room_modules
    import app.tools

    for info in pkgutil.iter_modules(app.room_modules.__path__):
        plugin = importlib.import_module(f"app.room_modules.{info.name}").module
        _modules[plugin.key] = plugin
    for info in pkgutil.iter_modules(app.tools.__path__):
        tool = importlib.import_module(f"app.tools.{info.name}").tool
        _tools[tool.name] = tool


def modules() -> dict[str, RoomModule]:
    if not _modules:
        discover()
    return _modules


def tools() -> dict[str, Tool]:
    if not _tools:
        discover()
    return _tools
