"""A* sobre la rejilla de la oficina (RF-MOV-01, RNF-REN-07)."""

import heapq
from collections.abc import Iterable

Tile = tuple[int, int]
_MOVES = ((1, 0), (-1, 0), (0, 1), (0, -1))


def find_path(width: int, height: int, blocked: set[Tile], start: Tile, goal: Tile) -> list[Tile]:
    """Ruta de start a goal incluidos; lista vacía si no hay camino."""
    if start == goal:
        return [start]
    if goal in blocked:
        return []
    gx, gy = goal
    frontier: list[tuple[int, int, Tile]] = [(abs(start[0] - gx) + abs(start[1] - gy), 0, start)]
    came: dict[Tile, Tile] = {}
    best = {start: 0}
    while frontier:
        _, cost, current = heapq.heappop(frontier)
        if current == goal:
            path = [current]
            while current in came:
                current = came[current]
                path.append(current)
            return path[::-1]
        if cost > best[current]:
            continue
        x, y = current
        for dx, dy in _MOVES:
            nx, ny = x + dx, y + dy
            if not (0 <= nx < width and 0 <= ny < height) or (nx, ny) in blocked:
                continue
            next_cost = cost + 1
            if next_cost < best.get((nx, ny), 1 << 30):
                best[(nx, ny)] = next_cost
                came[(nx, ny)] = current
                heapq.heappush(frontier, (next_cost + abs(nx - gx) + abs(ny - gy), next_cost, (nx, ny)))
    return []


def wall_tiles(x: int, y: int, width: int, height: int, doors: Iterable[Tile]) -> set[Tile]:
    """Perímetro de una sala menos sus puertas."""
    walls = {(x + i, y + j) for i in range(width) for j in (0, height - 1)}
    walls |= {(x + i, y + j) for i in (0, width - 1) for j in range(height)}
    return walls - set(doors)
