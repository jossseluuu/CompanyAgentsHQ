import hashlib
import secrets
from datetime import timedelta
from typing import Annotated

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, Cookie, Depends, Header, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import Db, utcnow
from app.core.errors import AppError
from app.core.models import AuthSession, Owner

SESSION_COOKIE = "cahq_session"
CSRF_COOKIE = "cahq_csrf"
_hasher = PasswordHasher()

router = APIRouter(prefix="/auth", tags=["auth"])


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class Setup(Credentials):
    name: str = Field(min_length=1, max_length=120)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def _start_session(db: AsyncSession, owner: Owner, response: Response) -> str:
    settings = get_settings()
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    age = timedelta(days=settings.session_days)
    db.add(AuthSession(owner_id=owner.id, token_hash=_hash(token), csrf_token=csrf, expires_at=utcnow() + age))
    common = {"secure": settings.cookie_secure, "samesite": "lax", "max_age": int(age.total_seconds())}
    response.set_cookie(SESSION_COOKIE, token, httponly=True, **common)  # type: ignore[arg-type]
    response.set_cookie(CSRF_COOKIE, csrf, httponly=False, **common)  # type: ignore[arg-type]
    return csrf


async def owner_from_token(db: AsyncSession, token: str | None) -> tuple[Owner, AuthSession] | None:
    if not token:
        return None
    row = (
        await db.execute(
            select(Owner, AuthSession)
            .join(AuthSession, AuthSession.owner_id == Owner.id)
            .where(AuthSession.token_hash == _hash(token), AuthSession.expires_at > utcnow())
        )
    ).first()
    return (row[0], row[1]) if row else None


async def current_owner(
    request: Request,
    db: Db,
    session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
    csrf: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> Owner:
    found = await owner_from_token(db, session)
    if found is None:
        raise AppError("unauthenticated", "Inicia sesión", 401)
    owner, auth_session = found
    if request.method not in {"GET", "HEAD", "OPTIONS"} and csrf != auth_session.csrf_token:
        raise AppError("csrf_failed", "Falta el token CSRF", 403)
    return owner


CurrentOwner = Annotated[Owner, Depends(current_owner)]


@router.get("/status")
async def status(db: Db) -> dict[str, bool]:
    """Indica si hay que crear el dueño (primer arranque)."""
    count = (await db.execute(select(func.count()).select_from(Owner))).scalar_one()
    return {"needs_setup": count == 0}


@router.post("/setup", status_code=201)
async def setup(body: Setup, response: Response, db: Db) -> dict[str, str]:
    count = (await db.execute(select(func.count()).select_from(Owner))).scalar_one()
    if count:
        raise AppError("already_set_up", "El dueño ya existe", 409)
    owner = Owner(email=body.email.lower(), name=body.name, password_hash=_hasher.hash(body.password))
    db.add(owner)
    await db.flush()
    return {"csrf_token": await _start_session(db, owner, response), "name": owner.name}


@router.post("/login")
async def login(body: Credentials, response: Response, db: Db) -> dict[str, str]:
    owner = (await db.execute(select(Owner).where(Owner.email == body.email.lower()))).scalar_one_or_none()
    invalid = AppError("invalid_credentials", "Correo o contraseña incorrectos", 401)
    if owner is None:
        raise invalid
    try:
        _hasher.verify(owner.password_hash, body.password)
    except VerifyMismatchError:
        raise invalid from None
    return {"csrf_token": await _start_session(db, owner, response), "name": owner.name}


def password_matches(owner: Owner, password: str) -> bool:
    try:
        return _hasher.verify(owner.password_hash, password)
    except VerifyMismatchError:
        return False


@router.get("/me")
async def me(db: Db, session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None) -> dict[str, str]:
    found = await owner_from_token(db, session)
    if found is None:
        raise AppError("unauthenticated", "Inicia sesión", 401)
    return {"name": found[0].name, "email": found[0].email, "csrf_token": found[1].csrf_token}


@router.post("/logout")
async def logout(
    response: Response,
    owner: CurrentOwner,
    db: Db,
    session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> dict[str, bool]:
    await db.execute(delete(AuthSession).where(AuthSession.token_hash == _hash(session or "")))
    response.delete_cookie(SESSION_COOKIE)
    response.delete_cookie(CSRF_COOKIE)
    return {"ok": True}
