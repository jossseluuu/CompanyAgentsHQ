import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";

import { api } from "@/api/client";
import type { FurnitureItem, Room } from "@/api/types";
import { Button, ErrorNote, Field, inputClass } from "@/shared/ui";
import { useOffice } from "@/store/office";
import { t } from "@/shared/i18n";

const FURNITURE: Record<string, string> = {
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
};

const NEW_ROOM = { name: "", width: 10, height: 8, color: "#bfdbfe" };

const slugify = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "sala";

function NumberField({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (value: number) => void }) {
  return (
    <Field label={label}>
      <input type="number" min={min} className={inputClass} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  );
}

function NewRoomForm({ rooms, run }: { rooms: Room[]; run: (action: () => Promise<unknown>) => Promise<boolean> }) {
  const [form, setForm] = useState(NEW_ROOM);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const taken = new Set(rooms.map((r) => r.slug));
    let slug = slugify(form.name);
    for (let suffix = 2; taken.has(slug); suffix += 1) slug = `${slugify(form.name)}-${suffix}`;
    const grid_y = Math.max(...rooms.map((r) => r.grid_y + r.height), -1) + 2;
    if (await run(() => api.post("/rooms", { ...form, slug, grid_x: 1, grid_y }))) setForm(NEW_ROOM);
  };
  return (
    <form onSubmit={submit} className="space-y-2 rounded bg-ink-soft p-2">
      <h3 className="font-semibold">{t("Nueva sala")}</h3>
      <Field label={t("Nombre de la sala")}>
        <input required maxLength={120} className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <NumberField label={t("Ancho")} min={4} value={form.width} onChange={(width) => setForm({ ...form, width })} />
        <NumberField label={t("Fondo")} min={4} value={form.height} onChange={(height) => setForm({ ...form, height })} />
        <Field label={t("Color")}>
          <input type="color" className="h-7 w-full rounded" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
        </Field>
      </div>
      <Button type="submit" tone="primary">{t("Crear sala")}</Button>
    </form>
  );
}

function RoomForm({ room, run }: { room: Room; run: (action: () => Promise<unknown>) => Promise<boolean> }) {
  const [form, setForm] = useState({
    name: room.name,
    color: room.color,
    grid_x: room.grid_x,
    grid_y: room.grid_y,
    width: room.width,
    height: room.height,
  });
  useEffect(() => setForm({ name: room.name, color: room.color, grid_x: room.grid_x, grid_y: room.grid_y, width: room.width, height: room.height }), [room]);
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
        void run(() => api.patch(`/rooms/${room.id}`, form));
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
      <div className="flex gap-2">
        <Button type="submit" tone="primary">{t("Guardar sala")}</Button>
        <Button tone="danger" onClick={remove}>{t("Borrar sala")}</Button>
      </div>
    </form>
  );
}

function FurnitureList({ room, run }: { room: Room; run: (action: () => Promise<unknown>) => Promise<boolean> }) {
  const selected = useOffice((s) => s.editFurnitureId);
  const { editPick } = useOffice.getState();
  const nudge = (item: FurnitureItem, dx: number, dy: number, turn = 0) =>
    run(() =>
      api.patch(`/furniture/${item.id}`, {
        grid_x: item.grid_x + dx,
        grid_y: item.grid_y + dy,
        rotation: (item.rotation + turn) % 360,
      }),
    );
  return (
    <section className="space-y-1 rounded bg-ink-soft p-2">
      <h3 className="font-semibold">{t("Muebles")}</h3>
      <p className="text-xs text-slate-300">{t("Elige un mueble y pulsa en el suelo para colocarlo, o usa las flechas.")}</p>
      <ul className="space-y-1">
        {room.furniture.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-1">
            <button
              aria-pressed={selected === item.id}
              className={`min-w-0 flex-1 truncate rounded px-1 text-left ${selected === item.id ? "bg-indigo-600 text-white" : "hover:bg-ink-line"}`}
              onClick={() => editPick(selected === item.id ? null : item.id)}
            >
              {FURNITURE[item.model_key] ?? item.model_key} ({item.grid_x}, {item.grid_y})
            </button>
            <Button aria-label={t("Mover a la izquierda")} onClick={() => nudge(item, -1, 0)}>←</Button>
            <Button aria-label={t("Mover hacia atrás")} onClick={() => nudge(item, 0, -1)}>↑</Button>
            <Button aria-label={t("Mover hacia delante")} onClick={() => nudge(item, 0, 1)}>↓</Button>
            <Button aria-label={t("Mover a la derecha")} onClick={() => nudge(item, 1, 0)}>→</Button>
            <Button aria-label={t("Girar el mueble")} onClick={() => nudge(item, 0, 0, 90)}>⟳</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Todo lo que se hace en la escena se puede hacer aquí, con teclado y sin WebGL (RNF-USA-01). */
export function OfficeEditor() {
  const client = useQueryClient();
  const rooms = useOffice((s) => s.snapshot?.office.rooms ?? []);
  const roomId = useOffice((s) => s.editRoomId);
  const sceneError = useOffice((s) => s.editError);
  const { setEditing, editSelect } = useOffice.getState();
  const [error, setError] = useState<unknown>(null);
  const room = rooms.find((r) => r.id === roomId);

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
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{t("Editar oficina")}</h2>
        <Button onClick={() => setEditing(false)}>{t("Terminar")}</Button>
      </header>
      <ErrorNote error={error ?? sceneError} />
      <Field label={t("Sala")}>
        <select className={inputClass} value={roomId ?? ""} onChange={(e) => editSelect(e.target.value || null)}>
          <option value="">{t("Elige una sala")}</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </Field>
      {room && <RoomForm room={room} run={run} />}
      {room && <FurnitureList room={room} run={run} />}
      <NewRoomForm rooms={rooms} run={run} />
    </aside>
  );
}
