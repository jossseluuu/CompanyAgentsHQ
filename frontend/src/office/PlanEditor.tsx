import { useQueryClient } from "@tanstack/react-query";
import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/api/client";
import type { Agent, FurnitureItem, Room } from "@/api/types";
import { t } from "@/shared/i18n";
import { useOffice } from "@/store/office";

import { STYLE_SWATCH } from "./furnitureModels";
import { type Box, contentFits, furnitureFits, isWall, roomAt, roomFits, seatFits, span, type Tile, tileKey, tilesOf, turned } from "./planRules";

const SPARE_TILES = 6;
const ZOOMS = [1, 1.5, 2, 3];
const OK = "#22c55e";
const BAD = "#ef4444";

export const FURNITURE_LABELS: Record<string, string> = {
  desk: t("Escritorio"),
  filing_cabinet: t("Archivador"),
  board: t("Tablón"),
  bookshelf: t("Estantería"),
  screen: t("Pantalla"),
  sofa: t("Sofá"),
  coffee_machine: t("Cafetera"),
  plant: t("Planta"),
  meeting_table: t("Mesa de reuniones"),
  whiteboard: t("Pizarra"),
  inbox: t("Bandeja"),
  lamp: t("Lámpara"),
  rug: t("Alfombra"),
  water_cooler: t("Fuente de agua"),
  printer: t("Impresora"),
  office_chair: t("Silla de oficina"),
  locker: t("Taquilla"),
  sideboard: t("Aparador"),
  reception_desk: t("Mostrador de recepción"),
  bulletin_board: t("Tablón de anuncios"),
  magnetic_board: t("Pizarra magnética"),
  interactive_board: t("Pizarra interactiva"),
  flip_chart: t("Rotafolio"),
  projector_screen: t("Pantalla de proyección"),
  television: t("Televisor"),
  computer: t("Ordenador"),
  laptop: t("Portátil"),
  projector: t("Proyector"),
  server_rack: t("Armario de servidores"),
  photocopier: t("Fotocopiadora"),
  scanner: t("Escáner"),
  shredder: t("Destructora de papel"),
  water_dispenser: t("Dispensador de agua"),
  vending_machine: t("Máquina de aperitivos"),
  drink_vending_machine: t("Máquina de bebidas"),
  refrigerator: t("Frigorífico"),
  microwave: t("Microondas"),
  air_conditioner: t("Aire acondicionado"),
  air_purifier: t("Purificador de aire"),
  fan: t("Ventilador"),
  heater: t("Radiador"),
  phone_booth: t("Cabina telefónica"),
  soundproof_booth: t("Cabina insonorizada"),
  trash_can: t("Papelera"),
  recycling_bin: t("Contenedor de reciclaje"),
  vacuum_cleaner: t("Aspiradora"),
  fire_extinguisher: t("Extintor"),
  security_camera: t("Cámara de seguridad"),
  turnstile: t("Torno de acceso"),
  carpet: t("Moqueta"),
  curtain: t("Cortina"),
  blinds: t("Persiana"),
  wall_clock: t("Reloj"),
  mirror: t("Espejo"),
  painting: t("Cuadro"),
  sculpture: t("Escultura"),
  aquarium: t("Acuario"),
  umbrella_stand: t("Paragüero"),
  magazine_rack: t("Revistero"),
  information_kiosk: t("Punto de información"),
  pallet_rack: t("Estantería de palés"),
  warehouse_rack: t("Estantería de almacén"),
  industrial_workbench: t("Banco de trabajo"),
  platform_trolley: t("Carro de plataforma"),
};

export const FURNITURE_GROUPS: Record<string, string> = {
  office: t("Oficina"),
  boards: t("Pizarras y paneles"),
  tech: t("Tecnología y equipos"),
  kitchen: t("Cocina y descanso"),
  comfort: t("Confort"),
  safety: t("Limpieza y seguridad"),
  decor: t("Decoración"),
  storage: t("Almacén y zonas comunes"),
};

type Drag =
  | { kind: "room"; room: Room; grab: Tile; box: Box }
  | { kind: "resize"; room: Room; box: Box }
  | { kind: "furniture"; item: FurnitureItem; grab: Tile; at: Tile }
  | { kind: "seat"; agent: Agent; at: Tile }
  | { kind: "draw"; from: Tile; to: Tile };

const drawn = (from: Tile, to: Tile): Box => ({
  grid_x: Math.min(from[0], to[0]),
  grid_y: Math.min(from[1], to[1]),
  width: Math.abs(from[0] - to[0]) + 1,
  height: Math.abs(from[1] - to[1]) + 1,
});

const sameBox = (a: Box, b: Box) => a.grid_x === b.grid_x && a.grid_y === b.grid_y && a.width === b.width && a.height === b.height;

export const moveItem = (item: FurnitureItem, change: Partial<FurnitureItem>) =>
  api.patch(`/furniture/${item.id}`, {
    grid_x: item.grid_x,
    grid_y: item.grid_y,
    rotation: item.rotation,
    width: item.width,
    depth: item.depth,
    variant: item.variant,
    ...change,
  });

function Walls({ room }: { room: Room }) {
  const doors = new Set(room.doors.map(([x, y]) => `${x},${y}`));
  const tiles: Tile[] = [];
  for (let i = 0; i < room.width; i += 1) tiles.push([room.grid_x + i, room.grid_y], [room.grid_x + i, room.grid_y + room.height - 1]);
  for (let j = 1; j < room.height - 1; j += 1) tiles.push([room.grid_x, room.grid_y + j], [room.grid_x + room.width - 1, room.grid_y + j]);
  return (
    <g pointerEvents="none">
      {tiles.filter((tile) => !doors.has(tileKey(tile))).map(([x, y]) => <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill="#475569" stroke="#334155" strokeWidth={0.04} />)}
      {room.doors.map(([x, y]) => <rect key={`${x},${y}`} data-door={`${x},${y}`} x={x} y={y} width={1} height={1} fill="#b7793a" stroke="#fde68a" strokeWidth={0.08} />)}
    </g>
  );
}

/** Raya en el lado que mira al frente: sin ella, un mueble de 1 × 1 girado se vería igual. */
function FrontMark({ x, y, across, deep, rotation }: { x: number; y: number; across: number; deep: number; rotation: number }) {
  const bar = 0.16;
  const box = {
    0: { x: x + 0.15, y: y + deep - 0.06 - bar, width: across - 0.3, height: bar },
    90: { x: x + across - 0.06 - bar, y: y + 0.15, width: bar, height: deep - 0.3 },
    180: { x: x + 0.15, y: y + 0.06, width: across - 0.3, height: bar },
    270: { x: x + 0.06, y: y + 0.15, width: bar, height: deep - 0.3 },
  }[rotation] ?? null;
  return box && <rect {...box} fill="#38bdf8" pointerEvents="none" />;
}

/** Plano editable: lo que se arrastra aquí se avisa en verde o rojo antes de soltar. */
export function PlanEditor() {
  const client = useQueryClient();
  const office = useOffice((s) => s.snapshot?.office);
  const agents = Object.values(useOffice((s) => s.agents));
  const tool = useOffice((s) => s.editTool);
  const brush = useOffice((s) => s.editBrush);
  const selectedRoom = useOffice((s) => s.editRoomId);
  const selectedItem = useOffice((s) => s.editFurnitureId);
  const draft = useOffice((s) => s.editDraft);
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<Tile | null>(null);
  const [zoom, setZoom] = useState(0);
  const moved = useRef(false);
  const rooms = office?.rooms ?? [];

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      const { setEditError } = useOffice.getState();
      setEditError(null);
      try {
        await action();
        await client.invalidateQueries({ queryKey: ["snapshot"] });
      } catch (failure) {
        setEditError(failure);
      }
    },
    [client],
  );

  const picked = rooms.flatMap((r) => r.furniture).find((f) => f.id === selectedItem);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) return;
      const { editBrush, setEditBrush, editPick, setEditTool } = useOffice.getState();
      const arrows: Record<string, Tile> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (event.key === "Escape") {
        setEditBrush(null);
        editPick(null);
        setEditTool("select");
      } else if (event.key.toLowerCase() === "r" && editBrush) {
        setEditBrush({ ...editBrush, rotation: (editBrush.rotation + 90) % 360 });
      } else if (event.key.toLowerCase() === "r" && picked) {
        void run(() => moveItem(picked, turned(picked)));
      } else if ((event.key === "Delete" || event.key === "Backspace") && picked && (!picked.interactive || picked.model_key === "desk")) {
        void run(async () => {
          await api.del(`/furniture/${picked.id}`);
          editPick(null);
        });
      } else if (arrows[event.key] && picked) {
        event.preventDefault();
        const [dx, dy] = arrows[event.key];
        void run(() => moveItem(picked, { grid_x: picked.grid_x + dx, grid_y: picked.grid_y + dy }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked, run]);

  if (!office) return null;

  const tileAt = (event: PointerEvent): Tile | null => {
    const matrix = svg.current?.getScreenCTM?.()?.inverse();
    if (!matrix || !svg.current) return null;
    const point = svg.current.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix);
    return [Math.floor(local.x), Math.floor(local.y)];
  };

  const start = (event: PointerEvent, next: Drag) => {
    event.stopPropagation();
    moved.current = false;
    svg.current?.setPointerCapture?.(event.pointerId);
    setDrag(next);
  };

  const onDown = (event: PointerEvent) => {
    const tile = tileAt(event);
    if (!tile) return;
    const { editSelect, editPick, setEditDraft, placeFurniture } = useOffice.getState();
    if (brush) {
      void run(() => placeFurniture(tile[0], tile[1]));
      return;
    }
    const room = roomAt(rooms, tile);
    if (tool === "door") {
      if (!room) return;
      editSelect(room.id);
      void toggleDoor(room, tile, event.shiftKey);
    } else if (tool === "room") {
      setEditDraft(null);
      start(event, { kind: "draw", from: tile, to: tile });
    } else if (room) {
      editSelect(room.id);
      start(event, { kind: "room", room, grab: tile, box: room });
    } else {
      editSelect(null);
      editPick(null);
    }
  };

  const toggleDoor = async (room: Room, tile: Tile, keepOthers: boolean) => {
    const { setEditError } = useOffice.getState();
    if (!isWall(room, tile)) {
      setEditError(t("Las puertas van en una pared, fuera de las esquinas"));
      return;
    }
    const key = tileKey(tile);
    const open = room.doors.some(([x, y]) => tileKey([x, y]) === key);
    if (open && room.doors.length === 1) {
      setEditError(t("La sala necesita al menos una puerta"));
      return;
    }
    const doors = open ? room.doors.filter(([x, y]) => tileKey([x, y]) !== key) : keepOthers ? [...room.doors, tile] : [tile];
    await run(() => api.patch(`/rooms/${room.id}`, { doors }));
  };

  const onMove = (event: PointerEvent) => {
    const tile = tileAt(event);
    if (!tile) return;
    setHover((old) => (old && tileKey(old) === tileKey(tile) ? old : tile));
    if (!drag) return;
    if (drag.kind === "room") {
      const box = { ...drag.room, grid_x: drag.room.grid_x + tile[0] - drag.grab[0], grid_y: drag.room.grid_y + tile[1] - drag.grab[1] };
      if (!sameBox(box, drag.box)) moved.current = true;
      setDrag({ ...drag, box });
    } else if (drag.kind === "resize") {
      setDrag({ ...drag, box: { ...drag.box, width: tile[0] - drag.box.grid_x + 1, height: tile[1] - drag.box.grid_y + 1 } });
      moved.current = true;
    } else if (drag.kind === "furniture") {
      const at: Tile = [drag.item.grid_x + tile[0] - drag.grab[0], drag.item.grid_y + tile[1] - drag.grab[1]];
      if (tileKey(at) !== tileKey(drag.at)) moved.current = true;
      setDrag({ ...drag, at });
    } else if (drag.kind === "seat") {
      if (tileKey(tile) !== tileKey(drag.at)) moved.current = true;
      setDrag({ ...drag, at: tile });
    } else {
      setDrag({ ...drag, to: tile });
    }
  };

  const onUp = () => {
    const finished = drag;
    setDrag(null);
    if (!finished) return;
    if (finished.kind === "draw") {
      const box = drawn(finished.from, finished.to);
      if (box.width >= 4 && box.height >= 4) useOffice.getState().setEditDraft(box);
      return;
    }
    if (!moved.current) return;
    if (finished.kind === "room" || finished.kind === "resize") {
      const { grid_x, grid_y, width, height } = finished.box;
      void run(() => api.patch(`/rooms/${finished.room.id}`, { grid_x, grid_y, width, height }));
    } else if (finished.kind === "furniture") {
      void run(() => moveItem(finished.item, { grid_x: finished.at[0], grid_y: finished.at[1] }));
    } else {
      void run(() => api.put(`/agents/${finished.agent.id}/seat`, { grid_x: finished.at[0], grid_y: finished.at[1] }));
    }
  };

  const ghostFor = () => {
    if (brush && hover) {
      const shape = { ...brush, grid_x: hover[0], grid_y: hover[1] };
      const room = roomAt(rooms, hover);
      return { tiles: tilesOf(shape), ok: Boolean(room && furnitureFits(room, agents, shape)) };
    }
    if (drag?.kind === "furniture") {
      const shape = { ...drag.item, grid_x: drag.at[0], grid_y: drag.at[1] };
      const room = roomAt(rooms, drag.at);
      return { tiles: tilesOf(shape), ok: Boolean(room && furnitureFits(room, agents, shape, drag.item.id)) };
    }
    if (drag?.kind === "seat") {
      const room = roomAt(rooms, drag.at);
      return { tiles: [drag.at], ok: Boolean(room && seatFits(room, agents, drag.at, drag.agent.id)) };
    }
    return null;
  };
  const ghost = ghostFor();
  const outline =
    drag?.kind === "room" || drag?.kind === "resize"
      ? { box: drag.box, ok: roomFits(rooms, drag.box, drag.room.id) && contentFits(drag.room, agents, drag.box) }
      : drag?.kind === "draw"
        ? { box: drawn(drag.from, drag.to), ok: roomFits(rooms, drawn(drag.from, drag.to)) }
        : draft
          ? { box: draft, ok: roomFits(rooms, draft) }
          : null;

  const width = office.width + SPARE_TILES;
  const height = office.height + SPARE_TILES;
  const cursor = brush ? "copy" : tool === "select" ? "default" : "crosshair";

  return (
    <div className="relative h-full overflow-auto bg-slate-900">
      <div className="sticky left-2 top-2 z-10 flex h-0 gap-1">
        <button type="button" aria-label={t("Acercar")} title={t("Acercar")} className="scene-button" onClick={() => setZoom(Math.min(zoom + 1, ZOOMS.length - 1))}>＋</button>
        <button type="button" aria-label={t("Alejar")} title={t("Alejar")} className="scene-button" onClick={() => setZoom(Math.max(zoom - 1, 0))}>－</button>
      </div>
    <svg
      ref={svg}
      role="application"
      aria-label={t("Plano editable de la oficina")}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMin meet"
      className="touch-none select-none"
      style={{ cursor, width: `${ZOOMS[zoom] * 100}%`, height: "auto" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => setHover(null)}
    >
      <defs>
        <pattern id="plan-grid" width={1} height={1} patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#334155" strokeWidth={0.03} />
        </pattern>
      </defs>
      <rect width={width} height={height} fill="url(#plan-grid)" />
      {rooms.map((room) => (
        <g key={room.id} data-room={room.slug}>
          <rect x={room.grid_x} y={room.grid_y} width={room.width} height={room.height} fill={room.color} fillOpacity={0.85} />
          <rect x={room.grid_x} y={room.grid_y} width={room.width} height={room.height} fill="url(#plan-grid)" />
          <Walls room={room} />
          <text x={room.grid_x + 0.2} y={room.grid_y + 0.75} fontSize={0.62} fontWeight={700} fill="#f8fafc" pointerEvents="none">{room.name}</text>
          {room.id === selectedRoom && <rect x={room.grid_x} y={room.grid_y} width={room.width} height={room.height} fill="none" stroke="#818cf8" strokeWidth={0.18} pointerEvents="none" />}
        </g>
      ))}
      {rooms.flatMap((room) =>
        room.furniture.map((item) => {
          const [across, deep] = span(item);
          return (
            <g
              key={item.id}
              data-furniture={item.model_key}
              data-rotation={item.rotation}
              className={tool === "select" && !brush ? "cursor-move" : undefined}
              pointerEvents={tool === "select" && !brush ? undefined : "none"}
              onPointerDown={(event) => {
                const tile = tileAt(event);
                if (!tile) return;
                const { editSelect, editPick } = useOffice.getState();
                editSelect(room.id);
                editPick(item.id);
                start(event, { kind: "furniture", item, grab: tile, at: [item.grid_x, item.grid_y] });
              }}
            >
              <title>{`${FURNITURE_LABELS[item.model_key] ?? item.model_key} ${item.width}×${item.depth}`}</title>
              <rect
                x={item.grid_x + 0.06}
                y={item.grid_y + 0.06}
                width={across - 0.12}
                height={deep - 0.12}
                rx={0.1}
                fill={STYLE_SWATCH[item.variant] ?? STYLE_SWATCH.classic}
                stroke={item.id === selectedItem ? "#818cf8" : "#0f172a"}
                strokeWidth={item.id === selectedItem ? 0.16 : 0.05}
              />
              <FrontMark x={item.grid_x} y={item.grid_y} across={across} deep={deep} rotation={item.rotation} />
              <text x={item.grid_x + across / 2} y={item.grid_y + deep / 2 + 0.16} fontSize={0.45} fontWeight={700} textAnchor="middle" fill={item.variant === "light" ? "#0f172a" : "#f8fafc"} pointerEvents="none">
                {(FURNITURE_LABELS[item.model_key] ?? item.model_key).slice(0, across * 3)}
              </text>
            </g>
          );
        }),
      )}
      {agents.map((agent) => (
        <g
          key={agent.id}
          data-agent={agent.name}
          className={tool === "select" && !brush ? "cursor-grab" : undefined}
          pointerEvents={tool === "select" && !brush ? undefined : "none"}
          onPointerDown={(event) => start(event, { kind: "seat", agent, at: [agent.seat_x, agent.seat_y] })}
        >
          <title>{t("Puesto de {0}", agent.name)}</title>
          <circle cx={agent.seat_x + 0.5} cy={agent.seat_y + 0.5} r={0.42} fill="#1e293b" stroke="#f8fafc" strokeWidth={0.07} />
          <text x={agent.seat_x + 0.5} y={agent.seat_y + 0.72} fontSize={0.55} fontWeight={700} textAnchor="middle" fill="#f8fafc" pointerEvents="none">{agent.name.slice(0, 1)}</text>
        </g>
      ))}
      {rooms.filter((room) => room.id === selectedRoom).map((room) => (
        <rect
          key={room.id}
          aria-label={t("Redimensionar sala")}
          x={room.grid_x + room.width - 0.7}
          y={room.grid_y + room.height - 0.7}
          width={1}
          height={1}
          rx={0.15}
          fill="#818cf8"
          stroke="#f8fafc"
          strokeWidth={0.08}
          className="cursor-nwse-resize"
          onPointerDown={(event) => start(event, { kind: "resize", room, box: room })}
        />
      ))}
      {outline && <rect x={outline.box.grid_x} y={outline.box.grid_y} width={outline.box.width} height={outline.box.height} fill={outline.ok ? OK : BAD} fillOpacity={0.25} stroke={outline.ok ? OK : BAD} strokeWidth={0.15} strokeDasharray="0.5 0.3" pointerEvents="none" />}
      {ghost?.tiles.map(([x, y]) => <rect key={`${x},${y}`} data-ghost={ghost.ok ? "ok" : "bad"} x={x} y={y} width={1} height={1} fill={ghost.ok ? OK : BAD} fillOpacity={0.55} pointerEvents="none" />)}
    </svg>
    </div>
  );
}
