import asyncio
import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import plugins
from app.core.config import get_settings
from app.core.db import session_scope
from app.core.errors import AppError, NotFound
from app.core.events import Event, bus, emit
from app.core.util import as_uuid, row, rows
from app.domains.agents import service as agents_service
from app.domains.office.models import AgentMove, Furniture, Room, RoomAccess, RoomModuleRow
from app.domains.office.pathfinding import Tile, find_path, wall_tiles
from app.domains.office.routines import destination

GRID_MARGIN = 2
_walk_generation: dict[uuid.UUID, int] = {}


async def get_room(db: AsyncSession, company_id: uuid.UUID, room_id: uuid.UUID) -> Room:
    room = await db.get(Room, room_id)
    if room is None or room.company_id != company_id:
        raise NotFound("Sala")
    return room


async def list_rooms(db: AsyncSession, company_id: uuid.UUID) -> list[Room]:
    return list((await db.execute(select(Room).where(Room.company_id == company_id))).scalars())


async def room_by_slug(db: AsyncSession, company_id: uuid.UUID, slug: str) -> Room | None:
    stmt = select(Room).where(Room.company_id == company_id, Room.slug == slug)
    return (await db.execute(stmt)).scalar_one_or_none()


async def room_modules(db: AsyncSession, room_id: uuid.UUID) -> list[RoomModuleRow]:
    stmt = select(RoomModuleRow).where(RoomModuleRow.room_id == room_id, RoomModuleRow.enabled.is_(True))
    return list((await db.execute(stmt)).scalars())


async def module_row(db: AsyncSession, room_id: uuid.UUID, key: str) -> RoomModuleRow | None:
    stmt = select(RoomModuleRow).where(RoomModuleRow.room_id == room_id, RoomModuleRow.module_key == key)
    return (await db.execute(stmt)).scalar_one_or_none()


async def rooms_with_module(db: AsyncSession, company_id: uuid.UUID, key: str) -> list[Room]:
    stmt = (
        select(Room)
        .join(RoomModuleRow, RoomModuleRow.room_id == Room.id)
        .where(Room.company_id == company_id, RoomModuleRow.module_key == key, RoomModuleRow.enabled.is_(True))
    )
    return list((await db.execute(stmt)).scalars())


async def _room_furniture(db: AsyncSession, room_id: uuid.UUID) -> list[Furniture]:
    stmt = (
        select(Furniture)
        .join(RoomModuleRow, Furniture.room_module_id == RoomModuleRow.id)
        .where(RoomModuleRow.room_id == room_id)
    )
    return list((await db.execute(stmt)).scalars())


async def create_room(db: AsyncSession, company_id: uuid.UUID, **fields: Any) -> Room:
    room = Room(company_id=company_id, **fields)
    db.add(room)
    await db.flush()
    await emit(db, "room.created", row(room))
    return room


async def update_room(db: AsyncSession, room: Room, fields: dict[str, Any]) -> Room:
    for key, value in fields.items():
        setattr(room, key, value)
    await db.flush()
    await emit(db, "room.updated", row(room))
    return room


async def delete_room(db: AsyncSession, room: Room) -> None:
    if await agents_service.agents_in_room(db, room.id):
        raise AppError("room_not_empty", "Traslada antes a los agentes de la sala", 409)
    await db.delete(room)
    await emit(db, "room.deleted", {"id": room.id})


def _reserved(room: Room) -> set[Tile]:
    """Casillas junto a las puertas: se dejan libres para no tapar el paso."""
    reserved: set[Tile] = set()
    for door_x, door_y in room.doors:
        reserved |= {(door_x + dx, door_y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)}
    return reserved


def _interior(room: Room) -> list[Tile]:
    return [
        (x, y)
        for y in range(room.grid_y + 1, room.grid_y + room.height - 1)
        for x in range(room.grid_x + 1, room.grid_x + room.width - 1)
    ]


async def add_furniture(
    db: AsyncSession, room: Room, module: RoomModuleRow, model_key: str, x: int, y: int, rotation: int = 0,
    interactive: bool = False,
) -> Furniture:
    item = Furniture(
        room_module_id=module.id, model_key=model_key, grid_x=x, grid_y=y, rotation=rotation, interactive=interactive
    )
    db.add(item)
    await db.flush()
    return item


async def install_module(
    db: AsyncSession, room: Room, key: str, config: dict[str, Any] | None = None
) -> RoomModuleRow:
    plugin = plugins.modules().get(key)
    if plugin is None:
        raise AppError("unknown_module", f"El módulo {key} no existe", 404)
    existing = await module_row(db, room.id, key)
    if existing is not None:
        existing.enabled = True
        await db.flush()
        return existing
    module = RoomModuleRow(room_id=room.id, module_key=key, config={**plugin.default_config, **(config or {})})
    db.add(module)
    await db.flush()
    taken = {(f.grid_x, f.grid_y) for f in await _room_furniture(db, room.id)} | _reserved(room)
    taken |= await agents_service.seats_in_room(db, room.id)
    free = [tile for tile in _interior(room) if tile not in taken]
    for spec in plugin.furniture:
        wanted = (room.grid_x + spec.dx, room.grid_y + spec.dy)
        tile = wanted if wanted in free else (free[0] if free else None)
        if tile is None:
            break
        free.remove(tile)
        await add_furniture(db, room, module, spec.model_key, *tile, spec.rotation, spec.interactive)
    await emit(db, "module.updated", {"room_id": room.id, "module_key": key, "installed": True})
    return module


async def uninstall_module(db: AsyncSession, room: Room, key: str) -> None:
    module = await module_row(db, room.id, key)
    if module is None:
        raise NotFound("Módulo")
    await db.delete(module)
    await emit(db, "module.updated", {"room_id": room.id, "module_key": key, "installed": False})


async def configure_module(db: AsyncSession, room: Room, key: str, config: dict[str, Any]) -> RoomModuleRow:
    module = await module_row(db, room.id, key)
    if module is None:
        raise NotFound("Módulo")
    module.config = {**module.config, **config}
    await db.flush()
    await emit(db, "module.updated", {"room_id": room.id, "module_key": key})
    return module


def catalog() -> list[dict[str, Any]]:
    return [
        {
            "key": m.key,
            "name": m.name,
            "description": m.description,
            "priority": m.priority,
            "ui_panel": m.ui_panel,
            "tools": m.tools(),
        }
        for m in plugins.modules().values()
    ]


async def room_details(db: AsyncSession, room: Room) -> dict[str, Any]:
    data = row(room)
    data["modules"] = [
        {**row(m), "name": getattr(plugins.modules().get(m.module_key), "name", m.module_key)}
        for m in await room_modules(db, room.id)
    ]
    data["furniture"] = rows(await _room_furniture(db, room.id))
    return data


async def office_map(db: AsyncSession, company_id: uuid.UUID) -> dict[str, Any]:
    rooms = await list_rooms(db, company_id)
    width, height = _bounds(rooms)
    return {"width": width, "height": height, "rooms": [await room_details(db, room) for room in rooms]}


def _bounds(rooms: list[Room]) -> tuple[int, int]:
    width = max((r.grid_x + r.width for r in rooms), default=20) + GRID_MARGIN
    height = max((r.grid_y + r.height for r in rooms), default=20) + GRID_MARGIN
    return width, height


async def build_grid(db: AsyncSession, company_id: uuid.UUID) -> tuple[int, int, set[Tile]]:
    rooms = await list_rooms(db, company_id)
    blocked: set[Tile] = set()
    for room in rooms:
        blocked |= wall_tiles(
            room.grid_x, room.grid_y, room.width, room.height, [(d[0], d[1]) for d in room.doors]
        )
        blocked |= {(f.grid_x, f.grid_y) for f in await _room_furniture(db, room.id)}
    return *_bounds(rooms), blocked


async def can_enter(db: AsyncSession, agent: Any, room: Room) -> bool:
    stmt = select(RoomAccess).where(RoomAccess.room_id == room.id, RoomAccess.agent_id == agent.id)
    access = (await db.execute(stmt)).scalar_one_or_none()
    if access is not None:
        return access.can_enter
    return not room.restricted or agent.home_room_id == room.id


async def can_use_tools(db: AsyncSession, agent: Any, room: Room) -> bool:
    stmt = select(RoomAccess).where(RoomAccess.room_id == room.id, RoomAccess.agent_id == agent.id)
    access = (await db.execute(stmt)).scalar_one_or_none()
    if access is not None:
        return access.can_use_tools
    return not room.restricted or agent.home_room_id == room.id


async def set_access(
    db: AsyncSession, room: Room, agent_id: uuid.UUID, can_enter_room: bool, use_tools: bool
) -> None:
    await db.execute(delete(RoomAccess).where(RoomAccess.room_id == room.id, RoomAccess.agent_id == agent_id))
    db.add(RoomAccess(room_id=room.id, agent_id=agent_id, can_enter=can_enter_room, can_use_tools=use_tools))
    await db.flush()


def _room_at(rooms: list[Room], tile: Tile) -> Room | None:
    for room in rooms:
        inside_x = room.grid_x <= tile[0] < room.grid_x + room.width
        inside_y = room.grid_y <= tile[1] < room.grid_y + room.height
        if inside_x and inside_y:
            return room
    return None


async def _free_tile(db: AsyncSession, room: Room, blocked: set[Tile], agent: Any) -> Tile | None:
    others = await agents_service.occupied_tiles(db, room.company_id, exclude=agent.id)
    free = [t for t in _interior(room) if t not in blocked and t not in others and t not in _reserved(room)]
    return free[int(agent.id) % len(free)] if free else None


async def _resolve(db: AsyncSession, agent: Any, target: str, room_id: uuid.UUID | None, blocked: set[Tile]) -> Tile | None:
    company_id = agent.company_id
    if target == "workplace":
        if room_id and room_id != agent.home_room_id:
            room = await db.get(Room, room_id)
            return await _free_tile(db, room, blocked, agent) if room else None
        return (agent.seat_x, agent.seat_y)
    if target == "break":
        rooms = await rooms_with_module(db, company_id, "break_area")
    elif target == "boardroom":
        rooms = await rooms_with_module(db, company_id, "meeting_table")
    elif target == "cabinet":
        cabinet = await _nearest_cabinet(db, agent, room_id, blocked)
        return cabinet or (agent.seat_x, agent.seat_y)
    else:
        return None
    return await _free_tile(db, rooms[0], blocked, agent) if rooms else None


async def _nearest_cabinet(
    db: AsyncSession, agent: Any, room_id: uuid.UUID | None, blocked: set[Tile]
) -> Tile | None:
    room = await db.get(Room, room_id or agent.home_room_id)
    if room is None:
        return None
    for item in await _room_furniture(db, room.id):
        if item.model_key == "filing_cabinet":
            around = [(item.grid_x + dx, item.grid_y + dy) for dx, dy in ((0, 1), (1, 0), (-1, 0), (0, -1))]
            for tile in around:
                if tile not in blocked and tile in _interior(room):
                    return tile
    return None


async def move_agent(
    db: AsyncSession, agent: Any, goal: Tile, reason: str, task_id: uuid.UUID | None = None
) -> list[Tile]:
    width, height, blocked = await build_grid(db, agent.company_id)
    start = (agent.pos_x, agent.pos_y)
    path = find_path(width, height, blocked - {start}, start, goal)
    if len(path) < 2:
        return []
    agent.pos_x, agent.pos_y = goal
    final_room = _room_at(await list_rooms(db, agent.company_id), goal)
    agent.current_room_id = final_room.id if final_room else None
    db.add(AgentMove(agent_id=agent.id, task_id=task_id, path=[list(t) for t in path], reason=reason))
    await db.flush()
    seconds = get_settings().walk_seconds_per_tile
    await emit(
        db,
        "agent.moved",
        {
            "agent_id": agent.id,
            "path": path,
            "seconds_per_tile": seconds,
            "reason": reason,
            "room_id": agent.current_room_id,
        },
    )
    return path


async def _arrive(agent_id: uuid.UUID, generation: int, delay: float, reason: str) -> None:
    await asyncio.sleep(delay)
    if _walk_generation.get(agent_id) != generation:
        return
    async with session_scope() as db:
        await emit(db, "agent.arrived", {"agent_id": agent_id, "reason": reason})


async def walk(db: AsyncSession, agent: Any, target: str, reason: str, room_id: uuid.UUID | None = None) -> None:
    """Mueve al agente al destino simbólico y anuncia la llegada al terminar el recorrido."""
    _, _, blocked = await build_grid(db, agent.company_id)
    goal = await _resolve(db, agent, target, room_id, blocked)
    if goal is None:
        return
    path = await move_agent(db, agent, goal, reason, agent.current_task_id)
    generation = _walk_generation.get(agent.id, 0) + 1
    _walk_generation[agent.id] = generation
    delay = get_settings().walk_seconds_per_tile * max(len(path) - 1, 0)
    bus._spawn(_arrive(agent.id, generation, delay, reason))


async def on_agent_status(event: Event) -> None:
    data = event.data
    async with session_scope() as db:
        agent = await agents_service.find(db, as_uuid(data["agent_id"]))
        if agent is None or agent.archived_at:
            return
        target = destination(await agents_service.routine_rules(db, agent.id), data["status"], data.get("tool"))
        if target is None:
            return
        room_id = as_uuid(data["room_id"]) if data.get("room_id") else None
        await walk(db, agent, target, data["status"], room_id)


async def visit(db: AsyncSession, agent: Any, other: Any, text: str) -> None:
    """El agente camina hasta el puesto de otro y muestra un bocadillo (RF-MOV-04, RF-MOV-05)."""
    _, _, blocked = await build_grid(db, agent.company_id)
    around = [(other.seat_x + dx, other.seat_y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1))]
    goal = next((t for t in around if t not in blocked), None)
    if goal:
        await move_agent(db, agent, goal, "visit", agent.current_task_id)
    await emit(db, "agent.bubble", {"agent_id": agent.id, "to": other.id, "text": text[:120]})


async def recorded_path(db: AsyncSession, agent_id: uuid.UUID, task_id: uuid.UUID | None) -> list[dict[str, Any]]:
    stmt = select(AgentMove).where(AgentMove.agent_id == agent_id).order_by(AgentMove.created_at)
    if task_id:
        stmt = stmt.where(AgentMove.task_id == task_id)
    return rows((await db.execute(stmt.limit(200))).scalars())


def register() -> None:
    bus.subscribe("agent.status", on_agent_status)
