import type { Agent, FurnitureItem, Room } from "@/api/types";

/** Copia en el cliente de las reglas del servidor para avisar antes de soltar; quien decide sigue siendo la API. */
export type Tile = [number, number];
export type Box = Pick<Room, "grid_x" | "grid_y" | "width" | "height">;
export type Shape = Pick<FurnitureItem, "grid_x" | "grid_y" | "width" | "depth" | "rotation">;

export const tileKey = ([x, y]: Tile) => `${x},${y}`;

/** Ancho y fondo tal como queda en el suelo: girar 90° los cruza. */
export function span({ width, depth, rotation }: Pick<Shape, "width" | "depth" | "rotation">): [number, number] {
  return rotation % 180 === 90 ? [depth, width] : [width, depth];
}

/** Giro de 90° alrededor de su centro: un mueble largo no se sale por la pared que tiene al lado. */
export function turned(shape: Shape) {
  const [width, depth] = span(shape);
  const rotation = (shape.rotation + 90) % 360;
  const [nextWidth, nextDepth] = span({ ...shape, rotation });
  return {
    rotation,
    grid_x: shape.grid_x + Math.trunc((width - nextWidth) / 2),
    grid_y: shape.grid_y + Math.trunc((depth - nextDepth) / 2),
  };
}

export function tilesOf(shape: Shape): Tile[] {
  const [width, depth] = span(shape);
  const tiles: Tile[] = [];
  for (let i = 0; i < width; i += 1) for (let j = 0; j < depth; j += 1) tiles.push([shape.grid_x + i, shape.grid_y + j]);
  return tiles;
}

export const roomAt = (rooms: Room[], [x, y]: Tile) =>
  rooms.find((r) => x >= r.grid_x && x < r.grid_x + r.width && y >= r.grid_y && y < r.grid_y + r.height);

export const isInterior = (room: Box, [x, y]: Tile) =>
  x > room.grid_x && x < room.grid_x + room.width - 1 && y > room.grid_y && y < room.grid_y + room.height - 1;

export function isWall(room: Box, [x, y]: Tile) {
  const right = room.grid_x + room.width - 1;
  const bottom = room.grid_y + room.height - 1;
  const side = (x === room.grid_x || x === right) && y > room.grid_y && y < bottom;
  const edge = (y === room.grid_y || y === bottom) && x > room.grid_x && x < right;
  return side || edge;
}

const nearDoor = (room: Room, [x, y]: Tile) => room.doors.some(([a, b]) => Math.max(Math.abs(a - x), Math.abs(b - y)) <= 1);

const seatsIn = (room: Room, agents: Agent[]) => new Set(agents.filter((a) => a.home_room_id === room.id).map((a) => tileKey([a.seat_x, a.seat_y])));

export function furnitureFits(room: Room, agents: Agent[], shape: Shape, skip?: string) {
  const others = new Set(room.furniture.filter((f) => f.id !== skip).flatMap((f) => tilesOf(f).map(tileKey)));
  const seats = seatsIn(room, agents);
  return tilesOf(shape).every((tile) => isInterior(room, tile) && !others.has(tileKey(tile)) && !seats.has(tileKey(tile)) && !nearDoor(room, tile));
}

export function seatFits(room: Room, agents: Agent[], tile: Tile, agentId: string) {
  const blocked = new Set(room.furniture.filter((f) => f.model_key !== "rug").flatMap((f) => tilesOf(f).map(tileKey)));
  const seats = seatsIn(room, agents.filter((a) => a.id !== agentId));
  return isInterior(room, tile) && !blocked.has(tileKey(tile)) && !seats.has(tileKey(tile)) && !nearDoor(room, tile);
}

export function roomFits(rooms: Room[], box: Box, skip?: string) {
  if (box.grid_x < 0 || box.grid_y < 0 || box.width < 4 || box.height < 4 || box.width > 40 || box.height > 40) return false;
  return rooms
    .filter((r) => r.id !== skip)
    .every(
      (r) => box.grid_x >= r.grid_x + r.width || r.grid_x >= box.grid_x + box.width || box.grid_y >= r.grid_y + r.height || r.grid_y >= box.grid_y + box.height,
    );
}

/** Al crecer o moverse no pueden quedar fuera ni muebles ni puestos. */
export function contentFits(room: Room, agents: Agent[], box: Box) {
  const [dx, dy] = [box.grid_x - room.grid_x, box.grid_y - room.grid_y];
  const tiles: Tile[] = [
    ...room.furniture.flatMap((f) => tilesOf(f)),
    ...agents.filter((a) => a.home_room_id === room.id).map((a): Tile => [a.seat_x, a.seat_y]),
  ];
  return tiles.every(([x, y]) => isInterior(box, [x + dx, y + dy]));
}
