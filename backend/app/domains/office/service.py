import asyncio
import random
import time
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
from app.domains.audit import service as audit_service
from app.domains.office import furniture_catalog as catalog_data
from app.domains.office.models import AgentMove, Furniture, Room, RoomAccess, RoomModuleRow
from app.domains.office.pathfinding import Tile, find_path, wall_tiles
from app.domains.office.routines import DEFAULT_RULES, TARGETS, destination

GRID_MARGIN = 2
MAP_LIMIT = 90
_walk_generation: dict[uuid.UUID, int] = {}
_strolling_until: dict[uuid.UUID, float] = {}

AT_EASE = frozenset({"idle", "resting"})
STROLL_CHANCE = 0.5
LINGER_SECONDS = 10.0
CHATTER = {
    "es": [
        ("¿Café?", "Venga, uno rápido"), ("¿Qué tal va todo?", "Liado, pero bien"),
        ("¿Has visto la pizarra?", "Sí, menudo plan"),
        ("Buenos días", "Hola, ¿cómo vas?"), ("¿Comemos luego?", "Hecho"), ("Vaya semana", "Y aún queda"),
    ],
    "en": [
        ("Coffee?", "Sure, a quick one"), ("How's it going?", "Busy, but fine"), ("Seen the whiteboard?", "Yes, big plans"),
        ("Morning!", "Hi, how are you?"), ("Lunch later?", "Deal"), ("What a week", "And it's not over"),
    ],
}


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


def tiles_of(corner: Tile, width: int, depth: int) -> set[Tile]:
    return {(corner[0] + i, corner[1] + j) for i in range(width) for j in range(depth)}


def footprint(item: Furniture) -> set[Tile]:
    """Casillas que ocupa: la esquina superior izquierda es (grid_x, grid_y) y girar 90° cruza ancho y fondo."""
    crossed = item.rotation % 180 == 90
    width, depth = (item.depth, item.width) if crossed else (item.width, item.depth)
    return tiles_of((item.grid_x, item.grid_y), width, depth)


def _overlaps(room: Room, x: int, y: int, width: int, height: int) -> bool:
    apart_x = x >= room.grid_x + room.width or room.grid_x >= x + width
    apart_y = y >= room.grid_y + room.height or room.grid_y >= y + height
    return not (apart_x or apart_y)


async def is_free(
    db: AsyncSession, company_id: uuid.UUID, x: int, y: int, width: int, height: int, skip: uuid.UUID | None = None
) -> bool:
    return not any(r.id != skip and _overlaps(r, x, y, width, height) for r in await list_rooms(db, company_id))


async def free_spot(db: AsyncSession, company_id: uuid.UUID) -> tuple[int, int]:
    """Debajo de la última sala, con un pasillo de por medio."""
    rooms = await list_rooms(db, company_id)
    return 1, max((r.grid_y + r.height for r in rooms), default=-1) + 2


async def free_spot_for(db: AsyncSession, company_id: uuid.UUID, width: int, height: int) -> tuple[int, int]:
    """El primer hueco con pasillo alrededor, por filas: la oficina crece a lo ancho y a lo largo."""
    rooms = await list_rooms(db, company_id)
    for y in range(1, MAP_LIMIT):
        for x in range(1, MAP_LIMIT - width):
            if not any(_overlaps(r, x - 1, y - 1, width + 2, height + 2) for r in rooms):
                return x, y
    return await free_spot(db, company_id)


async def create_room(db: AsyncSession, company_id: uuid.UUID, **fields: Any) -> Room:
    if not await is_free(db, company_id, fields["grid_x"], fields["grid_y"], fields["width"], fields["height"]):
        raise AppError("room_overlap", "Esa sala se solapa con otra", 409)
    if await room_by_slug(db, company_id, fields["slug"]):
        raise AppError("room_slug_taken", "Ya hay una sala con ese identificador", 409)
    if not fields.get("doors"):
        fields["doors"] = [[fields["grid_x"] + fields["width"] // 2, fields["grid_y"]]]
    room = Room(company_id=company_id, **fields)
    db.add(room)
    await db.flush()
    await emit(db, "room.created", row(room))
    return room


def _carry_doors(room: Room, x: int, y: int, width: int, height: int) -> list[list[int]]:
    """Cada puerta sigue en su pared al mover o redimensionar la sala."""
    right, bottom = room.grid_x + room.width - 1, room.grid_y + room.height - 1
    doors = []
    for door_x, door_y in room.doors:
        new_x = x + width - 1 if door_x == right else x if door_x == room.grid_x else door_x - room.grid_x + x
        new_y = y + height - 1 if door_y == bottom else y if door_y == room.grid_y else door_y - room.grid_y + y
        doors.append([min(max(new_x, x), x + width - 1), min(max(new_y, y), y + height - 1)])
    return doors


def _on_wall(door: list[int], x: int, y: int, width: int, height: int) -> bool:
    on_side = door[0] in (x, x + width - 1) and y < door[1] < y + height - 1
    on_edge = door[1] in (y, y + height - 1) and x < door[0] < x + width - 1
    return on_side or on_edge


async def _reshape(db: AsyncSession, room: Room, fields: dict[str, Any]) -> None:
    x, y = fields.get("grid_x", room.grid_x), fields.get("grid_y", room.grid_y)
    width, height = fields.get("width", room.width), fields.get("height", room.height)
    if not await is_free(db, room.company_id, x, y, width, height, skip=room.id):
        raise AppError("room_overlap", "Esa sala se solapa con otra", 409)
    dx, dy = x - room.grid_x, y - room.grid_y
    inside = {(a, b) for a in range(x + 1, x + width - 1) for b in range(y + 1, y + height - 1)}
    items = await _room_furniture(db, room.id)
    agents = await agents_service.agents_in_room(db, room.id)
    spots = [(a + dx, b + dy) for f in items for a, b in footprint(f)]
    spots += [(a.seat_x + dx, a.seat_y + dy) for a in agents]
    if any(spot not in inside for spot in spots):
        raise AppError("room_too_small", "Mueve antes los muebles o los puestos que quedarían fuera", 409)
    if "doors" not in fields:
        fields["doors"] = _carry_doors(room, x, y, width, height)
    for item in items:
        item.grid_x, item.grid_y = item.grid_x + dx, item.grid_y + dy
    for agent in agents:
        agent.seat_x, agent.seat_y = agent.seat_x + dx, agent.seat_y + dy
        agent.pos_x, agent.pos_y = agent.pos_x + dx, agent.pos_y + dy
        await emit(db, "agent.updated", row(agent))


async def update_room(db: AsyncSession, room: Room, fields: dict[str, Any]) -> Room:
    x, y = fields.get("grid_x", room.grid_x), fields.get("grid_y", room.grid_y)
    width, height = fields.get("width", room.width), fields.get("height", room.height)
    if not all(_on_wall(door, x, y, width, height) for door in fields.get("doors", [])):
        raise AppError("door_outside", "La puerta debe estar en una pared de la sala", 422)
    if fields.keys() & {"grid_x", "grid_y", "width", "height"}:
        await _reshape(db, room, fields)
    for key, value in fields.items():
        setattr(room, key, value)
    await db.flush()
    if not await _reachable(db, room):
        raise AppError("tile_blocks_path", "Ahí dejaría a un agente sin paso", 409)
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
    db: AsyncSession,
    room: Room,
    module: RoomModuleRow,
    model_key: str,
    x: int,
    y: int,
    rotation: int = 0,
    interactive: bool = False,
    size: tuple[int, int] | None = None,
    variant: str = "classic",
) -> Furniture:
    width, depth = size or catalog_data.default_size(model_key)
    item = Furniture(
        room_module_id=module.id, model_key=model_key, grid_x=x, grid_y=y, rotation=rotation, interactive=interactive,
        width=width, depth=depth, variant=variant,
    )  # fmt: skip
    db.add(item)
    await db.flush()
    return item


async def _reachable(db: AsyncSession, room: Room) -> bool:
    width, height, blocked = await build_grid(db, room.company_id)
    seats = await agents_service.seats_in_room(db, room.id)
    if not room.doors:
        return True
    doors = [(door[0], door[1]) for door in room.doors]
    outside = (width - 1, height - 1)  # el margen de la rejilla queda siempre fuera de las salas
    if not any(find_path(width, height, blocked, door, outside) for door in doors):
        return False
    return all(any(find_path(width, height, blocked - {seat}, door, seat) for door in doors) for seat in seats)


def _check_look(model_key: str, size: tuple[int, int], variant: str) -> None:
    if size not in catalog_data.sizes(model_key):
        raise AppError("unknown_size", "Ese mueble no existe en ese tamaño", 422)
    if variant not in catalog_data.STYLES:
        raise AppError("unknown_variant", "Esa estética no existe", 422)


async def _check_fit(db: AsyncSession, room: Room, tiles: set[Tile], skip: uuid.UUID | None = None) -> None:
    if not tiles <= set(_interior(room)):
        raise AppError("tile_outside", "El mueble debe quedar dentro de su sala", 409)
    others = {tile for f in await _room_furniture(db, room.id) if f.id != skip for tile in footprint(f)}
    if tiles & (others | _reserved(room) | await agents_service.seats_in_room(db, room.id)):
        raise AppError("tile_taken", "Esa casilla está ocupada o bloquea una puerta", 409)


async def place_furniture(
    db: AsyncSession, room: Room, model_key: str, x: int, y: int, rotation: int,
    size: tuple[int, int] | None = None, variant: str = "classic",
) -> Furniture:  # fmt: skip
    if model_key not in catalog_data.FURNITURE:
        raise AppError("unknown_furniture", "Ese mueble no existe", 422)
    size = size or catalog_data.default_size(model_key)
    _check_look(model_key, size, variant)
    crossed = rotation % 180 == 90
    await _check_fit(db, room, tiles_of((x, y), *(size[::-1] if crossed else size)))
    team = await install_module(db, room, "team")
    item = await add_furniture(db, room, team, model_key, x, y, rotation, False, size, variant)
    if not await _reachable(db, room):
        await db.delete(item)
        raise AppError("tile_blocks_path", "Ahí dejaría a un agente sin paso", 409)
    await emit(db, "module.updated", {"room_id": room.id, "module_key": "team"})
    return item


async def remove_furniture(db: AsyncSession, company_id: uuid.UUID, furniture_id: uuid.UUID) -> None:
    item = await db.get(Furniture, furniture_id)
    module = await db.get(RoomModuleRow, item.room_module_id) if item else None
    if item is None or module is None:
        raise NotFound("Mueble")
    room = await get_room(db, company_id, module.room_id)
    if item.interactive and item.model_key != "desk":
        raise AppError("furniture_in_use", "Ese mueble pertenece a un módulo: desinstala el módulo", 409)
    await db.delete(item)
    await emit(db, "module.updated", {"room_id": room.id, "module_key": module.module_key})


async def move_furniture(
    db: AsyncSession, company_id: uuid.UUID, furniture_id: uuid.UUID, x: int, y: int, rotation: int,
    size: tuple[int, int] | None = None, variant: str | None = None,
) -> Furniture:  # fmt: skip
    item = await db.get(Furniture, furniture_id)
    module = await db.get(RoomModuleRow, item.room_module_id) if item else None
    if item is None or module is None:
        raise NotFound("Mueble")
    room = await get_room(db, company_id, module.room_id)
    size = size or (item.width, item.depth)
    variant = variant or item.variant
    _check_look(item.model_key, size, variant)
    crossed = rotation % 180 == 90
    await _check_fit(db, room, tiles_of((x, y), *(size[::-1] if crossed else size)), skip=item.id)
    previous = (item.grid_x, item.grid_y, item.rotation, item.width, item.depth, item.variant)
    item.grid_x, item.grid_y, item.rotation = x, y, rotation
    item.width, item.depth, item.variant = *size, variant
    await db.flush()
    if not await _reachable(db, room):
        item.grid_x, item.grid_y, item.rotation, item.width, item.depth, item.variant = previous
        await db.flush()
        raise AppError("tile_blocks_path", "Ahí dejaría a un agente sin paso", 409)
    await emit(db, "module.updated", {"room_id": room.id, "module_key": module.module_key})
    return item


def _spot_for(room: Room, spec: plugins.FurnitureSpec, free: list[Tile]) -> tuple[Tile, tuple[int, int]] | None:
    """Su sitio y tamaño habitual; si no cabe, el primer hueco, y si tampoco, un tamaño menor."""
    wanted = (room.grid_x + spec.dx, room.grid_y + spec.dy)
    for size in catalog_data.sizes(spec.model_key):
        for corner in (wanted, *free):
            if tiles_of(corner, *size) <= set(free):
                return corner, size
    return None


async def install_module(db: AsyncSession, room: Room, key: str, config: dict[str, Any] | None = None) -> RoomModuleRow:
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
    taken = {tile for f in await _room_furniture(db, room.id) for tile in footprint(f)} | _reserved(room)
    taken |= await agents_service.seats_in_room(db, room.id)
    free = [tile for tile in _interior(room) if tile not in taken]
    for spec in plugin.furniture:
        spot = _spot_for(room, spec, free)
        if spot is None:
            break
        corner, size = spot
        free = [tile for tile in free if tile not in tiles_of(corner, *size)]
        await add_furniture(db, room, module, spec.model_key, *corner, spec.rotation, spec.interactive, size)
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


def furniture_catalog() -> list[dict[str, Any]]:
    return catalog_data.listing()


def routine_options() -> dict[str, Any]:
    return {"defaults": DEFAULT_RULES, "targets": sorted(TARGETS)}


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
        blocked |= wall_tiles(room.grid_x, room.grid_y, room.width, room.height, [(d[0], d[1]) for d in room.doors])
        for item in await _room_furniture(db, room.id):
            if item.model_key not in catalog_data.WALKABLE:
                blocked |= footprint(item)
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


async def room_access(db: AsyncSession, room: Room) -> list[dict[str, Any]]:
    """La regla propia de cada agente, si la tiene, y lo que puede hacer con ella."""
    stmt = select(RoomAccess).where(RoomAccess.room_id == room.id)
    rules = {access.agent_id: access for access in (await db.execute(stmt)).scalars()}
    listing = []
    for agent in await agents_service.list_active(db, room.company_id):
        rule = rules.get(agent.id)
        listing.append(
            {
                "agent_id": agent.id,
                "name": agent.name,
                "home": agent.home_room_id == room.id,
                "custom": rule is not None,
                "can_enter": await can_enter(db, agent, room),
                "can_use_tools": await can_use_tools(db, agent, room),
            }
        )
    return listing


async def _leave_if_barred(db: AsyncSession, agent: Any, room: Room) -> None:
    if agent.current_room_id == room.id and not await can_enter(db, agent, room):
        await walk(db, agent, "workplace", "access")


async def set_access(db: AsyncSession, room: Room, agent: Any, can_enter_room: bool, use_tools: bool) -> None:
    if agent.home_room_id == room.id and not (can_enter_room and use_tools):
        raise AppError("home_room_access", "Es su sala base: trasládalo antes de quitarle el acceso", 409)
    await db.execute(delete(RoomAccess).where(RoomAccess.room_id == room.id, RoomAccess.agent_id == agent.id))
    db.add(RoomAccess(room_id=room.id, agent_id=agent.id, can_enter=can_enter_room, can_use_tools=use_tools))
    await db.flush()
    details = {"room_id": room.id, "can_enter": can_enter_room, "can_use_tools": use_tools}
    await audit_service.record(db, room.company_id, "owner", "room.access_changed", str(agent.id), details)
    await _leave_if_barred(db, agent, room)


async def clear_access(db: AsyncSession, room: Room, agent: Any) -> None:
    await db.execute(delete(RoomAccess).where(RoomAccess.room_id == room.id, RoomAccess.agent_id == agent.id))
    await db.flush()
    await audit_service.record(db, room.company_id, "owner", "room.access_cleared", str(agent.id), {"room_id": room.id})
    await _leave_if_barred(db, agent, room)


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


async def assign_seat(db: AsyncSession, agent: Any) -> None:
    room = await get_room(db, agent.company_id, agent.home_room_id)
    _, _, blocked = await build_grid(db, agent.company_id)
    taken = blocked | await agents_service.seats_in_room(db, room.id) | _reserved(room)
    with_desk = [(x, y) for x, y in _interior(room) if (x, y) not in taken and (x, y - 1) in set(_interior(room)) - taken]
    tile = with_desk[0] if with_desk else await _free_tile(db, room, taken, agent)
    if tile is not None:
        agent.seat_x, agent.seat_y = agent.pos_x, agent.pos_y = tile
        agent.current_room_id = room.id
        await db.flush()
        if with_desk:
            team = await install_module(db, room, "team")
            await add_furniture(db, room, team, "desk", tile[0], tile[1] - 1, 0, True)
            await emit(db, "module.updated", {"room_id": room.id, "module_key": "team"})
        await emit(db, "agent.updated", row(agent))


async def _take_desk(db: AsyncSession, agent: Any) -> tuple[int, int, str] | None:
    """Retira el escritorio del puesto que deja, salvo que lo comparta, y devuelve cómo era."""
    if agent.home_room_id is None:
        return None
    others = await agents_service.seats_in_room(db, agent.home_room_id) - {(agent.seat_x, agent.seat_y)}
    for item in await _room_furniture(db, agent.home_room_id):
        tiles = footprint(item)
        if item.model_key == "desk" and (agent.seat_x, agent.seat_y - 1) in tiles:
            if any((x, y + 1) in others for x, y in tiles):
                return None
            look = (item.width, item.depth, item.variant)
            await db.delete(item)
            await db.flush()
            return look
    return None


async def _give_desk(db: AsyncSession, room: Room, agent: Any, look: tuple[int, int, str] | None) -> None:
    width, depth, variant = look or (1, 1, "classic")
    _, _, blocked = await build_grid(db, room.company_id)
    free = set(_interior(room)) - blocked - _reserved(room) - await agents_service.seats_in_room(db, room.id)
    for size in ((width, depth), (1, 1)):
        corner = (agent.seat_x - (size[0] - 1) // 2, agent.seat_y - size[1])
        if tiles_of(corner, *size) <= free:
            team = await install_module(db, room, "team")
            await add_furniture(db, room, team, "desk", *corner, 0, True, size, variant)
            await emit(db, "module.updated", {"room_id": room.id, "module_key": "team"})
            return


async def relocate(db: AsyncSession, agent: Any, room: Room, tile: Tile | None = None) -> None:
    """Cambia el puesto del agente, en su sala o en otra, y su escritorio va con él."""
    look = await _take_desk(db, agent)
    if tile is None:
        agent.home_room_id = room.id
        await db.flush()
        await assign_seat(db, agent)
        if (agent.seat_x, agent.seat_y) not in _interior(room):
            raise AppError("room_full", "En esa sala no queda ningún puesto libre", 409)
    else:
        _, _, blocked = await build_grid(db, agent.company_id)
        others = await agents_service.seats_in_room(db, room.id) - {(agent.seat_x, agent.seat_y)}
        if tile not in _interior(room):
            raise AppError("tile_outside", "El puesto debe quedar dentro de una sala", 409)
        if tile in blocked | others | _reserved(room):
            raise AppError("tile_taken", "Esa casilla está ocupada o bloquea una puerta", 409)
        agent.home_room_id, agent.current_room_id = room.id, room.id
        agent.seat_x, agent.seat_y = agent.pos_x, agent.pos_y = tile
        await db.flush()
        await _give_desk(db, room, agent, look)
    if not await _reachable(db, room):
        raise AppError("tile_blocks_path", "Ahí dejaría a un agente sin paso", 409)
    await agents_service.update_agent(db, agent, {"home_room_id": room.id})


async def room_at(db: AsyncSession, company_id: uuid.UUID, tile: Tile) -> Room:
    room = _room_at(await list_rooms(db, company_id), tile)
    if room is None:
        raise AppError("tile_outside", "El puesto debe quedar dentro de una sala", 409)
    return room


async def _resolve(db: AsyncSession, agent: Any, target: str, room_id: uuid.UUID | None, blocked: set[Tile]) -> Tile | None:
    company_id = agent.company_id
    wanted = await db.get(Room, room_id) if room_id else None
    if wanted is not None and not await can_enter(db, agent, wanted):
        room_id = None  # sin permiso se queda en su sitio
    if target == "workplace":
        if room_id and room_id != agent.home_room_id:
            return await _free_tile(db, wanted, blocked, agent) if wanted else None
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
    open_rooms = [room for room in rooms if await can_enter(db, agent, room)]
    return await _free_tile(db, open_rooms[0], blocked, agent) if open_rooms else None


async def _nearest_cabinet(db: AsyncSession, agent: Any, room_id: uuid.UUID | None, blocked: set[Tile]) -> Tile | None:
    room = await db.get(Room, room_id or agent.home_room_id)
    if room is None:
        return None
    for item in await _room_furniture(db, room.id):
        if item.model_key == "filing_cabinet":
            around = [(x + dx, y + dy) for x, y in sorted(footprint(item)) for dx, dy in ((0, 1), (1, 0), (-1, 0), (0, -1))]
            for tile in around:
                if tile not in blocked and tile in _interior(room):
                    return tile
    return None


async def move_agent(
    db: AsyncSession, agent: Any, goal: Tile, reason: str, task_id: uuid.UUID | None = None, ambient: bool = False
) -> list[Tile]:
    width, height, blocked = await build_grid(db, agent.company_id)
    start = (agent.pos_x, agent.pos_y)
    path = find_path(width, height, blocked - {start}, start, goal)
    if len(path) < 2:
        return []
    agent.pos_x, agent.pos_y = goal
    final_room = _room_at(await list_rooms(db, agent.company_id), goal)
    agent.current_room_id = final_room.id if final_room else None
    if not ambient:
        db.add(AgentMove(agent_id=agent.id, task_id=task_id, path=[list(t) for t in path], reason=reason))
    await db.flush()
    seconds = get_settings().walk_seconds_per_tile
    await emit(
        db,
        "agent.strolled" if ambient else "agent.moved",
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
    room = await db.get(Room, other.home_room_id) if other.home_room_id else None
    if goal and (room is None or await can_enter(db, agent, room)):
        await move_agent(db, agent, goal, "visit", agent.current_task_id)
    await emit(db, "agent.bubble", {"agent_id": agent.id, "to": other.id, "text": text[:120]})


async def recorded_path(db: AsyncSession, agent_id: uuid.UUID, task_id: uuid.UUID | None) -> list[dict[str, Any]]:
    stmt = select(AgentMove).where(AgentMove.agent_id == agent_id).order_by(AgentMove.created_at)
    if task_id:
        stmt = stmt.where(AgentMove.task_id == task_id)
    return rows((await db.execute(stmt.limit(200))).scalars())


async def _stroll(db: AsyncSession, agent: Any, team: list[Any], locale: str, rng: random.Random) -> None:
    """Un paseo sin modelo ni coste: no pasa por la cola, y el trabajo real lo interrumpe al momento."""
    rooms = await list_rooms(db, agent.company_id)
    width, height, blocked = await build_grid(db, agent.company_id)
    others = [a for a in await agents_service.list_active(db, agent.company_id) if a.id != agent.id]
    taken = blocked | {(a.pos_x, a.pos_y) for a in others} | {(a.seat_x, a.seat_y) for a in others}
    open_rooms = [room for room in rooms if await can_enter(db, agent, room)]
    lounges = [r for r in await rooms_with_module(db, agent.company_id, "break_area") if await can_enter(db, agent, r)]

    def spots(room: Room) -> list[Tile]:
        return [t for t in _interior(room) if t not in taken and t not in _reserved(room)]

    partner = None
    goal: Tile | None = None
    roll = rng.random()
    mates = [a for a in team if a.id != agent.id and _strolling_until.get(a.id, 0) <= time.monotonic()]
    if roll < 0.25 and mates:
        partner = rng.choice(mates)
        around = [(partner.pos_x + dx, partner.pos_y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
        goal = next((t for t in around if t not in taken), None)
    elif roll < 0.6 and lounges:
        choices = spots(rng.choice(lounges))
        goal = rng.choice(choices) if choices else None
    elif roll < 0.8 and open_rooms:
        choices = spots(rng.choice(open_rooms))
        goal = rng.choice(choices) if choices else None
    elif roll < 0.9:
        tiles = ((x, y) for x in range(width) for y in range(height))
        hall = [tile for tile in tiles if tile not in taken and _room_at(rooms, tile) is None]
        goal = rng.choice(hall) if hall else None
    else:
        goal = (agent.seat_x, agent.seat_y)
    if goal is None:
        return
    path = await move_agent(db, agent, goal, "stroll", ambient=True)
    if not path:
        return
    until = time.monotonic() + get_settings().walk_seconds_per_tile * len(path) + LINGER_SECONDS
    _strolling_until[agent.id] = until
    if partner is not None:
        _strolling_until[partner.id] = until
        hello, reply = rng.choice(CHATTER.get(locale, CHATTER["es"]))
        await emit(db, "agent.chatter", {"agent_id": agent.id, "to": partner.id, "text": hello})
        await emit(db, "agent.chatter", {"agent_id": partner.id, "to": agent.id, "text": reply})


async def office_life(db: AsyncSession, company: Any, rng: random.Random | None = None) -> None:
    """Quien no tiene trabajo se mueve por la oficina, salvo que el dueño lo apague o su rutina lo deje en el puesto."""
    if (company.ai_settings or {}).get("office_life") is False:
        return
    dice = rng or random.Random()
    agents = await agents_service.list_active(db, company.id)
    team = [a for a in agents if a.status in AT_EASE and a.current_task_id is None and a.home_room_id]
    for agent in team:
        if dice.random() >= STROLL_CHANCE or _strolling_until.get(agent.id, 0) > time.monotonic():
            continue
        if (await agents_service.routine_rules(db, agent.id)).get("resting") == "workplace":
            continue
        await _stroll(db, agent, team, company.locale, dice)


def register() -> None:
    bus.subscribe("agent.status", on_agent_status)
