import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";

import { api } from "@/api/client";
import type { FurnitureItem, FurnitureModel, Room } from "@/api/types";
import { HireDialog } from "@/features/team/HireForm";
import { Badge, Button, ErrorNote, Field, inputClass } from "@/shared/ui";
import { type EditTool, useOffice } from "@/store/office";
import { t } from "@/shared/i18n";

import { STYLE_SWATCH } from "./furnitureModels";
import { turned } from "./planRules";
import { FURNITURE_GROUPS, FURNITURE_LABELS, moveItem } from "./PlanEditor";

const NEW_ROOM = { name: "", width: 10, height: 8, color: "#bfdbfe" };
const STYLES: Record<string, string> = { classic: t("Clásico"), dark: t("Oscuro"), light: t("Claro"), vivid: t("Vivo") };
const TOOLS: [EditTool, string, string][] = [
  ["select", t("Mover"), t("Arrastra salas, muebles y puestos. Las flechas mueven el mueble elegido, R lo gira y Supr lo quita.")],
  ["door", t("Puertas"), t("Pulsa una pared para llevar allí la puerta. Con Mayús añades otra; pulsa una puerta sobrante para cerrarla.")],
  ["room", t("Dibujar sala"), t("Arrastra sobre el suelo vacío para dibujar una sala de 4 × 4 o más y ponle nombre abajo.")],
];

type Run = (action: () => Promise<unknown>) => Promise<boolean>;

const slugify = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "sala";

type Wall = "north" | "south" | "west" | "east";
type Box = Pick<Room, "grid_x" | "grid_y" | "width" | "height">;

const WALLS: Record<Wall, string> = { north: t("Norte"), south: t("Sur"), west: t("Oeste"), east: t("Este") };

const wallOf = (room: Box, [x, y]: number[]): Wall =>
  y === room.grid_y ? "north" : y === room.grid_y + room.height - 1 ? "south" : x === room.grid_x ? "west" : "east";

const spotOf = (room: Box, [x, y]: number[]) => (y === room.grid_y || y === room.grid_y + room.height - 1 ? x - room.grid_x : y - room.grid_y);

function doorAt(room: Box, wall: Wall, spot: number) {
  if (wall === "north") return [room.grid_x + spot, room.grid_y];
  if (wall === "south") return [room.grid_x + spot, room.grid_y + room.height - 1];
  return [wall === "west" ? room.grid_x : room.grid_x + room.width - 1, room.grid_y + spot];
}

function NumberField({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (value: number) => void }) {
  return (
    <Field label={label}>
      <input type="number" min={min} className={inputClass} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  );
}

function NewRoomForm({ rooms, run }: { rooms: Room[]; run: Run }) {
  const [form, setForm] = useState(NEW_ROOM);
  const draft = useOffice((s) => s.editDraft);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const taken = new Set(rooms.map((r) => r.slug));
    let slug = slugify(form.name);
    for (let suffix = 2; taken.has(slug); suffix += 1) slug = `${slugify(form.name)}-${suffix}`;
    const grid_y = Math.max(...rooms.map((r) => r.grid_y + r.height), -1) + 2;
    const place = draft ?? { grid_x: 1, grid_y, width: form.width, height: form.height };
    if (await run(() => api.post("/rooms", { ...form, ...place, slug }))) {
      setForm(NEW_ROOM);
      useOffice.getState().setEditTool("select");
    }
  };
  return (
    <form onSubmit={submit} className="space-y-2 rounded bg-ink-soft p-2">
      <h3 className="font-semibold">{t("Nueva sala")}</h3>
      <Field label={t("Nombre de la sala")}>
        <input required maxLength={120} autoFocus={Boolean(draft)} className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <NumberField label={t("Ancho")} min={4} value={draft?.width ?? form.width} onChange={(width) => setForm({ ...form, width })} />
        <NumberField label={t("Fondo")} min={4} value={draft?.height ?? form.height} onChange={(height) => setForm({ ...form, height })} />
        <Field label={t("Color")}>
          <input type="color" className="h-7 w-full rounded" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
        </Field>
      </div>
      <Button type="submit" tone="primary">{t("Crear sala")}</Button>
    </form>
  );
}

function RoomForm({ room, run }: { room: Room; run: Run }) {
  const [form, setForm] = useState({
    name: room.name,
    color: room.color,
    grid_x: room.grid_x,
    grid_y: room.grid_y,
    width: room.width,
    height: room.height,
  });
  useEffect(() => setForm({ name: room.name, color: room.color, grid_x: room.grid_x, grid_y: room.grid_y, width: room.width, height: room.height }), [room]);
  const [restricted, setRestricted] = useState(Boolean(room.restricted));
  const [hiring, setHiring] = useState(false);
  const remove = () => {
    if (window.confirm(t("¿Borrar la sala {0}? Sus módulos y muebles desaparecerán.", room.name))) {
      void run(async () => {
        await api.del(`/rooms/${room.id}`);
        useOffice.getState().editSelect(null);
      });
    }
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void run(() => api.patch(`/rooms/${room.id}`, { ...form, restricted }));
      }}
      className="space-y-2 rounded bg-ink-soft p-2"
    >
      <h3 className="font-semibold">{t("Sala seleccionada")}</h3>
      <Field label={t("Nombre de la sala")}>
        <input required maxLength={120} className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label={t("Columna")} min={0} value={form.grid_x} onChange={(grid_x) => setForm({ ...form, grid_x })} />
        <NumberField label={t("Fila")} min={0} value={form.grid_y} onChange={(grid_y) => setForm({ ...form, grid_y })} />
        <NumberField label={t("Ancho")} min={4} value={form.width} onChange={(width) => setForm({ ...form, width })} />
        <NumberField label={t("Fondo")} min={4} value={form.height} onChange={(height) => setForm({ ...form, height })} />
      </div>
      <Field label={t("Color")}>
        <input type="color" className="h-7 w-full rounded" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
      </Field>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
        {t("Sala restringida")}
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" tone="primary">{t("Guardar sala")}</Button>
        <Button onClick={() => setHiring(true)}>{t("＋ Contratar aquí")}</Button>
        <Button tone="danger" onClick={remove}>{t("Borrar sala")}</Button>
      </div>
      {hiring && <HireDialog room={room} onClose={() => setHiring(false)} />}
    </form>
  );
}

function DoorList({ room, run }: { room: Room; run: Run }) {
  const [wall, setWall] = useState<Wall>("north");
  const [spot, setSpot] = useState(1);
  const save = (doors: number[][]) => run(() => api.patch(`/rooms/${room.id}`, { doors }));
  return (
    <section className="space-y-1 rounded bg-ink-soft p-2">
      <h3 className="font-semibold">{t("Puertas")}</h3>
      <ul>
        {room.doors.map((door) => (
          <li key={door.join(",")} className="flex items-center justify-between gap-1">
            {WALLS[wallOf(room, door)]}, {t("casilla")} {spotOf(room, door)}
            <Button
              aria-label={t("Cerrar la puerta")}
              disabled={room.doors.length === 1}
              onClick={() => save(room.doors.filter((other) => other !== door))}
            >
              ✕
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save([...room.doors, doorAt(room, wall, spot)]);
        }}
      >
        <Field label={t("Pared de la puerta")}>
          <select className={inputClass} value={wall} onChange={(e) => setWall(e.target.value as Wall)}>
            {Object.entries(WALLS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </Field>
        <NumberField label={t("Posición de la puerta")} min={1} value={spot} onChange={setSpot} />
        <Button type="submit">{t("Abrir")}</Button>
      </form>
    </section>
  );
}

function LookPicker({ model, width, depth, variant, onChange }: { model: FurnitureModel; width: number; depth: number; variant: string; onChange: (look: { width: number; depth: number; variant: string }) => void }) {
  return (
    <div className="space-y-1">
      <div role="group" aria-label={t("Tamaño")} className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-slate-300">{t("Tamaño")}</span>
        {model.sizes.map(([w, d]) => (
          <button
            key={`${w}x${d}`}
            type="button"
            aria-pressed={w === width && d === depth}
            className={`rounded border border-ink-line px-1.5 text-xs ${w === width && d === depth ? "bg-indigo-600 text-white" : "hover:bg-ink-line"}`}
            onClick={() => onChange({ width: w, depth: d, variant })}
          >
            {w}×{d}
          </button>
        ))}
      </div>
      <div role="group" aria-label={t("Estética")} className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-slate-300">{t("Estética")}</span>
        {model.variants.map((style) => (
          <button
            key={style}
            type="button"
            aria-pressed={style === variant}
            className={`flex items-center gap-1 rounded border border-ink-line px-1.5 text-xs ${style === variant ? "bg-indigo-600 text-white" : "hover:bg-ink-line"}`}
            onClick={() => onChange({ width, depth, variant: style })}
          >
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm border border-slate-500" style={{ background: STYLE_SWATCH[style] }} />
            {STYLES[style] ?? style}
          </button>
        ))}
      </div>
    </div>
  );
}

function Palette({ models }: { models: FurnitureModel[] }) {
  const brush = useOffice((s) => s.editBrush);
  const { setEditBrush } = useOffice.getState();
  const model = models.find((m) => m.key === brush?.model_key);
  const [group, setGroup] = useState("");
  const [text, setText] = useState("");
  const needle = text.trim().toLowerCase();
  const shown = models.filter((m) => (!group || m.group === group) && (!needle || (FURNITURE_LABELS[m.key] ?? m.key).toLowerCase().includes(needle)));
  return (
    <section className="space-y-2 rounded bg-ink-soft p-2">
      <h3 className="font-semibold">{t("Catálogo de muebles")}</h3>
      <div className="grid grid-cols-2 gap-1">
        <select aria-label={t("Categoría de muebles")} className={inputClass} value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">{t("Todas las categorías")}</option>
          {Object.entries(FURNITURE_GROUPS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <input aria-label={t("Buscar mueble")} placeholder={t("Buscar mueble")} className={inputClass} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto">
        {shown.map((entry) => (
          <button
            key={entry.key}
            type="button"
            aria-pressed={brush?.model_key === entry.key}
            className={`truncate rounded border border-ink-line px-1.5 py-1 text-left text-xs ${brush?.model_key === entry.key ? "bg-indigo-600 text-white" : "hover:bg-ink-line"}`}
            onClick={() => {
              if (brush?.model_key === entry.key) setEditBrush(null);
              else setEditBrush({ model_key: entry.key, width: entry.sizes[0][0], depth: entry.sizes[0][1], variant: "classic", rotation: 0 });
            }}
          >
            {FURNITURE_LABELS[entry.key] ?? entry.key}
          </button>
        ))}
      </div>
      {brush && model && (
        <>
          <LookPicker model={model} width={brush.width} depth={brush.depth} variant={brush.variant} onChange={(look) => setEditBrush({ ...brush, ...look })} />
          <Button onClick={() => setEditBrush({ ...brush, rotation: (brush.rotation + 90) % 360 })}>{t("⟳ Girar (R)")}</Button>
          <p className="text-xs text-slate-300">{t("Pulsa en el plano para colocarlo: verde cabe, rojo no. R lo gira y Esc termina.")}</p>
        </>
      )}
    </section>
  );
}

function ItemControls({ item, model, run }: { item: FurnitureItem; model?: FurnitureModel; run: Run }) {
  const nudge = (dx: number, dy: number) => run(() => moveItem(item, { grid_x: item.grid_x + dx, grid_y: item.grid_y + dy }));
  const editPick = useOffice((s) => s.editPick);
  const selected = useOffice((s) => s.editFurnitureId === item.id);
  return (
    <li className="space-y-1">
      <div className="flex items-center justify-between gap-1">
        <button
          aria-pressed={selected}
          className={`min-w-0 flex-1 truncate rounded px-1 text-left ${selected ? "bg-indigo-600 text-white" : "hover:bg-ink-line"}`}
          onClick={() => editPick(selected ? null : item.id)}
        >
          {FURNITURE_LABELS[item.model_key] ?? item.model_key} {item.width}×{item.depth} ({item.grid_x}, {item.grid_y})
        </button>
        <Button aria-label={t("Mover a la izquierda")} onClick={() => nudge(-1, 0)}>←</Button>
        <Button aria-label={t("Mover hacia atrás")} onClick={() => nudge(0, -1)}>↑</Button>
        <Button aria-label={t("Mover hacia delante")} onClick={() => nudge(0, 1)}>↓</Button>
        <Button aria-label={t("Mover a la derecha")} onClick={() => nudge(1, 0)}>→</Button>
        <Button aria-label={t("Girar el mueble")} onClick={() => run(() => moveItem(item, turned(item)))}>⟳</Button>
        {(!item.interactive || item.model_key === "desk") && (
          <Button aria-label={t("Quitar el mueble")} onClick={() => run(() => api.del(`/furniture/${item.id}`))}>✕</Button>
        )}
      </div>
      {selected && model && <LookPicker model={model} width={item.width} depth={item.depth} variant={item.variant} onChange={(look) => run(() => moveItem(item, look))} />}
    </li>
  );
}

/** Todo lo que se hace en el plano se puede hacer aquí, con teclado (RNF-USA-01). */
export function OfficeEditor() {
  const client = useQueryClient();
  const rooms = useOffice((s) => s.snapshot?.office.rooms ?? []);
  const roomId = useOffice((s) => s.editRoomId);
  const sceneError = useOffice((s) => s.editError);
  const tool = useOffice((s) => s.editTool);
  const pickedId = useOffice((s) => s.editFurnitureId);
  const view = useOffice((s) => s.editView);
  const { setEditing, editSelect, setEditTool, setEditView } = useOffice.getState();
  const [error, setError] = useState<unknown>(null);
  const { data: models = [] } = useQuery({ queryKey: ["furniture-catalog"], queryFn: () => api.get<FurnitureModel[]>("/furniture/catalog") });
  const room = rooms.find((r) => r.id === roomId);
  const picked = room?.furniture.find((f) => f.id === pickedId);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await client.invalidateQueries({ queryKey: ["snapshot"] });
      return true;
    } catch (failure) {
      setError(failure);
      return false;
    }
  };

  return (
    <aside aria-label={t("Editor de la oficina")} className="w-96 shrink-0 space-y-3 overflow-y-auto border-l border-ink-line p-3 text-sm">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t("Editar oficina")}</h2>
        <span className="flex gap-1">
          <Button onClick={() => setEditView(view === "plan" ? "scene" : "plan")}>{view === "plan" ? t("Ver en 3D") : t("Ver plano")}</Button>
          <Button onClick={() => setEditing(false)}>{t("Terminar")}</Button>
        </span>
      </header>
      <div role="group" aria-label={t("Herramienta")} className="flex gap-1">
        {TOOLS.map(([key, label]) => (
          <Button key={key} className="flex-1" aria-pressed={tool === key} tone={tool === key ? "primary" : "default"} onClick={() => setEditTool(key)}>{label}</Button>
        ))}
      </div>
      <p className="text-xs text-slate-300">{TOOLS.find(([key]) => key === tool)?.[2]}</p>
      <ErrorNote error={error ?? sceneError} />
      <Palette models={models} />
      {picked && (
        <section className="flex items-center justify-between gap-2 rounded bg-ink-soft p-2">
          <span className="truncate font-semibold">{FURNITURE_LABELS[picked.model_key] ?? picked.model_key} {picked.width}×{picked.depth}</span>
          <Button onClick={() => run(() => moveItem(picked, turned(picked)))}>{t("⟳ Girar (R)")}</Button>
        </section>
      )}
      <Field label={t("Sala")}>
        <select className={inputClass} value={roomId ?? ""} onChange={(e) => editSelect(e.target.value || null)}>
          <option value="">{t("Elige una sala")}</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </Field>
      {room && <RoomForm room={room} run={run} />}
      {room && <DoorList room={room} run={run} />}
      {room && (
        <section className="space-y-1 rounded bg-ink-soft p-2">
          <h3 className="flex items-center justify-between font-semibold">{t("Muebles")} <Badge>{room.furniture.length}</Badge></h3>
          <ul className="space-y-1">
            {room.furniture.map((item) => <ItemControls key={item.id} item={item} model={models.find((m) => m.key === item.model_key)} run={run} />)}
          </ul>
        </section>
      )}
      <NewRoomForm rooms={rooms} run={run} />
    </aside>
  );
}
