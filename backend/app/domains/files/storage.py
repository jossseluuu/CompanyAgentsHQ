"""Almacenamiento de ficheros: MinIO/S3 o carpeta local detrás de la misma interfaz."""

import asyncio
from pathlib import Path
from typing import Any, Protocol

from app.core.config import get_settings


class Storage(Protocol):
    async def put(self, key: str, data: bytes, mime: str) -> None: ...
    async def get(self, key: str) -> bytes: ...
    async def delete(self, key: str) -> None: ...


class LocalStorage:
    def __init__(self, root: Path) -> None:
        self.root = root

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root.resolve()):
            raise ValueError("clave fuera del almacén")
        return path

    def _write(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    async def put(self, key: str, data: bytes, mime: str) -> None:
        await asyncio.to_thread(self._write, key, data)

    async def get(self, key: str) -> bytes:
        return await asyncio.to_thread(self._path(key).read_bytes)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._path(key).unlink, True)


class S3Storage:
    def __init__(self) -> None:
        import boto3

        settings = get_settings()
        self.bucket = settings.s3_bucket
        self.client: Any = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint or None,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
        )
        self._ensured = False

    def _ensure_bucket(self) -> None:
        if self._ensured:
            return
        existing = {b["Name"] for b in self.client.list_buckets().get("Buckets", [])}
        if self.bucket not in existing:
            self.client.create_bucket(Bucket=self.bucket)
        self._ensured = True

    def _put(self, key: str, data: bytes, mime: str) -> None:
        self._ensure_bucket()
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=mime)

    async def put(self, key: str, data: bytes, mime: str) -> None:
        await asyncio.to_thread(self._put, key, data, mime)

    async def get(self, key: str) -> bytes:
        def read() -> bytes:
            body: bytes = self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
            return body

        return await asyncio.to_thread(read)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=key)


_storage: Storage | None = None


def storage() -> Storage:
    global _storage
    if _storage is None:
        settings = get_settings()
        _storage = S3Storage() if settings.storage_backend == "s3" else LocalStorage(settings.storage_dir)
    return _storage
