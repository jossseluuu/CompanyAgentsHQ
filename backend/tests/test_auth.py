from tests.conftest import Api


async def test_setup_only_once_and_login(guest: Api) -> None:
    assert (await guest.get("/auth/status"))["needs_setup"] is True  # type: ignore[index]
    body = {"email": "a@example.com", "password": "contraseña-1", "name": "A"}
    response = await guest.request("POST", "/auth/setup", 201, json=body)
    cookie = response.headers.get_list("set-cookie")
    assert any("HttpOnly" in c and "cahq_session" in c and "SameSite=lax" in c for c in cookie)
    await guest.request("POST", "/auth/setup", 409, json=body)
    guest.client.cookies.clear()
    await guest.request("GET", "/auth/me", 401)
    await guest.request("POST", "/auth/login", 401, json={**body, "password": "incorrecta-1"})
    await guest.request("POST", "/auth/login", 200, json={"email": "A@example.com", "password": body["password"]})
    await guest.request("GET", "/auth/me", 200)


async def test_password_is_hashed_with_argon2(owner: Api) -> None:
    from sqlalchemy import select

    from app.core.db import session_scope
    from app.core.models import Owner

    async with session_scope() as db:
        stored = (await db.execute(select(Owner))).scalar_one()
    assert stored.password_hash.startswith("$argon2")


async def test_mutations_need_csrf_token(api: Api) -> None:
    del api.client.headers["X-CSRF-Token"]
    response = await api.request("POST", "/company/pause")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "csrf_failed"


async def test_private_routes_need_session(guest: Api) -> None:
    response = await guest.request("GET", "/company")
    assert response.status_code == 401
    assert set(response.json()["error"]) == {"code", "message"}
