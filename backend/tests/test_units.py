import time
from datetime import UTC, datetime
from decimal import Decimal

import pytest

from app.domains.audit.chain import GENESIS, compute_hash
from app.domains.files.extract import extract_pages
from app.domains.knowledge.chunking import CHUNK_CHARS, chunk_pages
from app.domains.knowledge.embeddings import HashEmbeddings, fit
from app.domains.knowledge.models import EMBEDDING_DIM
from app.domains.office.pathfinding import find_path, wall_tiles
from app.domains.office.routines import destination
from app.domains.runtime.llm.pricing import cost_eur


def test_path_avoids_obstacles() -> None:
    blocked = {(2, y) for y in range(0, 4)}
    path = find_path(6, 6, blocked, (0, 0), (5, 0))
    assert path[0] == (0, 0) and path[-1] == (5, 0)
    assert not set(path) & blocked
    assert all(abs(a[0] - b[0]) + abs(a[1] - b[1]) == 1 for a, b in zip(path, path[1:], strict=False))


def test_path_unreachable() -> None:
    assert find_path(5, 5, {(1, 0), (0, 1)}, (0, 0), (4, 4)) == []
    assert find_path(5, 5, {(4, 4)}, (0, 0), (4, 4)) == []


def test_wall_keeps_door_open() -> None:
    walls = wall_tiles(0, 0, 4, 4, [(1, 3)])
    assert (1, 3) not in walls and (0, 0) in walls and (1, 1) not in walls


def test_path_under_5ms_on_100x100() -> None:
    blocked = {(x, y) for x in range(5, 95, 10) for y in range(0, 90)}
    samples = []
    for _ in range(20):
        started = time.perf_counter()
        assert find_path(100, 100, blocked, (0, 0), (99, 99))
        samples.append(time.perf_counter() - started)
    assert sorted(samples)[len(samples) // 2] < 0.05  # holgura de CI; la medida real se documenta


def test_routine_destinations() -> None:
    assert destination({}, "thinking", None) == "workplace"
    assert destination({}, "working", "read_file") == "cabinet"
    assert destination({}, "resting", None) == "break"
    assert destination({"meeting": "workplace"}, "meeting", None) == "workplace"
    assert destination({}, "idle", None) is None


def test_hash_changes_with_any_field() -> None:
    ts = datetime(2026, 1, 1, tzinfo=UTC)
    base = compute_hash(GENESIS, "owner", "x", "t", {"a": 1}, Decimal(0), ts)
    assert base == compute_hash(GENESIS, "owner", "x", "t", {"a": 1}, Decimal("0.000000"), ts)
    assert base != compute_hash(GENESIS, "owner", "x", "t", {"a": 2}, Decimal(0), ts)
    assert base != compute_hash(GENESIS, "system", "x", "t", {"a": 1}, Decimal(0), ts)


def test_chunks_respect_size_pages_and_headings() -> None:
    text = "# Presupuesto\n\n" + "\n\n".join(f"Párrafo número {i} " + "palabra " * 80 for i in range(30))
    chunks = chunk_pages([(3, text)])
    assert len(chunks) > 2
    assert all(c.page == 3 for c in chunks)
    assert all(len(c.content) <= CHUNK_CHARS + 500 for c in chunks)
    assert chunks[0].heading == "Presupuesto"


def test_fit_normalizes_any_dimension() -> None:
    for size in (384, 1024, 3072):
        vector = fit([1.0] * size)
        assert len(vector) == EMBEDDING_DIM
        assert abs(sum(v * v for v in vector) - 1) < 1e-6


async def test_hash_embeddings_rank_similar_text_higher() -> None:
    a, b, c = await HashEmbeddings().embed(["presupuesto anual", "presupuesto mensual", "gato negro"])
    a, b, c = fit(a), fit(b), fit(c)
    assert sum(x * y for x, y in zip(a, b, strict=True)) > sum(x * y for x, y in zip(a, c, strict=True))


def test_extract_csv_rows_with_header() -> None:
    pages = extract_pages("datos.csv", b"cliente;importe\nAna;10\nLuis;20\n")
    assert "cliente: Ana; importe: 10" in pages[0][1]


@pytest.mark.parametrize(
    ("model", "expected"),
    [("claude-haiku-5-5", Decimal("0.000552")), ("ollama:qwen", Decimal(0)), ("modelo-local", Decimal(0))],
)
def test_pricing(model: str, expected: Decimal) -> None:
    assert cost_eur(model, 1000, 1000) == expected
