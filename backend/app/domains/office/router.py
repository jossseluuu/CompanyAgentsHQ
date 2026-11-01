import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.core.db import Db
from app.core.util import row
from app.domains.company.service import CompanyDep
from app.domains.knowledge import service as knowledge_service
from app.domains.office import service

router = APIRouter(tags=["office"])


class RoomIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str = Field(min_length=1, max_length=60, pattern=r"^[a-z0-9-]+$")
    grid_x: int = Field(ge=0)
    grid_y: int = Field(ge=0)
    width: int = Field(ge=4, le=40)
    height: int = Field(ge=4, le=40)
    color: str = Field(default="#94a3b8", pattern=r"^#[0-9a-fA-F]{6}$")
    doors: list[list[int]] = []


class RoomPatch(BaseModel):
    name: str | None = None
    color: str | None = None
    grid_x: int | None = Field(default=None, ge=0)
    grid_y: int | None = Field(default=None, ge=0)
    width: int | None = Field(default=None, ge=4, le=40)
    height: int | None = Field(default=None, ge=4, le=40)
    doors: list[list[int]] | None = None
    restricted: bool | None = None


class FurnitureMove(BaseModel):
    grid_x: int = Field(ge=0)
    grid_y: int = Field(ge=0)
    rotation: int = Field(default=0, ge=0, lt=360)


class FurniturePlace(FurnitureMove):
    model_key: str


class ModuleIn(BaseModel):
    module_key: str
    config: dict[str, Any] = {}


class Access(BaseModel):
    agent_id: uuid.UUID
    can_enter: bool = True
    can_use_tools: bool = True


@router.get("/modules/catalog")
async def catalog(_: CompanyDep) -> list[dict[str, Any]]:
    return service.catalog()


@router.get("/office")
async def office(company: CompanyDep, db: Db) -> dict[str, Any]:
    return await service.office_map(db, company.id)


@router.post("/rooms", status_code=201)
async def create_room(body: RoomIn, company: CompanyDep, db: Db) -> dict[str, Any]:
    room = await service.create_room(db, company.id, **body.model_dump())
    await service.install_module(db, room, "team")
    await knowledge_service.ensure_base(db, company.id, "room", room.id, f"Conocimiento de {room.name}")
    return row(room)


@router.get("/rooms/{room_id}")
async def get_room(room_id: uuid.UUID, company: CompanyDep, db: Db) -> dict[str, Any]:
    return await service.room_details(db, await service.get_room(db, company.id, room_id))


@router.patch("/rooms/{room_id}")
async def patch_room(room_id: uuid.UUID, body: RoomPatch, company: CompanyDep, db: Db) -> dict[str, Any]:
    room = await service.get_room(db, company.id, room_id)
    return row(await service.update_room(db, room, body.model_dump(exclude_unset=True)))


@router.get("/furniture/catalog")
async def furniture_catalog() -> list[str]:
    return service.furniture_catalog()


@router.post("/rooms/{room_id}/furniture", status_code=201)
async def place_furniture(room_id: uuid.UUID, body: FurniturePlace, company: CompanyDep, db: Db) -> dict[str, Any]:
    room = await service.get_room(db, company.id, room_id)
    return row(await service.place_furniture(db, room, body.model_key, body.grid_x, body.grid_y, body.rotation))


@router.delete("/furniture/{furniture_id}", status_code=204)
async def remove_furniture(furniture_id: uuid.UUID, company: CompanyDep, db: Db) -> None:
    await service.remove_furniture(db, company.id, furniture_id)


@router.patch("/furniture/{furniture_id}")
async def move_furniture(furniture_id: uuid.UUID, body: FurnitureMove, company: CompanyDep, db: Db) -> dict[str, Any]:
    return row(await service.move_furniture(db, company.id, furniture_id, body.grid_x, body.grid_y, body.rotation))


@router.delete("/rooms/{room_id}", status_code=204)
async def delete_room(room_id: uuid.UUID, company: CompanyDep, db: Db) -> None:
    await service.delete_room(db, await service.get_room(db, company.id, room_id))


@router.post("/rooms/{room_id}/modules", status_code=201)
async def install(room_id: uuid.UUID, body: ModuleIn, company: CompanyDep, db: Db) -> dict[str, Any]:
    room = await service.get_room(db, company.id, room_id)
    return row(await service.install_module(db, room, body.module_key, body.config))


@router.delete("/rooms/{room_id}/modules/{key}", status_code=204)
async def uninstall(room_id: uuid.UUID, key: str, company: CompanyDep, db: Db) -> None:
    await service.uninstall_module(db, await service.get_room(db, company.id, room_id), key)


@router.patch("/rooms/{room_id}/modules/{key}")
async def configure(room_id: uuid.UUID, key: str, config: dict[str, Any], company: CompanyDep, db: Db) -> dict[str, Any]:
    room = await service.get_room(db, company.id, room_id)
    return row(await service.configure_module(db, room, key, config))


@router.put("/rooms/{room_id}/access")
async def access(room_id: uuid.UUID, body: Access, company: CompanyDep, db: Db) -> dict[str, bool]:
    room = await service.get_room(db, company.id, room_id)
    await service.set_access(db, room, body.agent_id, body.can_enter, body.can_use_tools)
    return {"ok": True}


@router.get("/agents/{agent_id}/path")
async def path(
    agent_id: uuid.UUID, _: CompanyDep, db: Db, task: Annotated[uuid.UUID | None, Query()] = None
) -> list[dict[str, Any]]:
    return await service.recorded_path(db, agent_id, task)
