import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { api } from "@/api/client";
import type { ModuleProps } from "@/modules/registry";
import { Button, Empty, inputClass } from "@/shared/ui";

export function Whiteboard({ room, module }: ModuleProps) {
  const client = useQueryClient();
  const [text, setText] = useState("");
  const notes: { author: string; text: string }[] = module.config.notes ?? [];
  const add = async (event: FormEvent) => {
    event.preventDefault();
    await api.patch(`/rooms/${room.id}/modules/whiteboard`, { notes: [...notes, { author: "Dueño", text }] });
    setText("");
    await client.invalidateQueries({ queryKey: ["room", room.id] });
  };
  return (
    <div className="space-y-2 text-sm">
      {notes.length === 0 && <Empty>Pizarra vacía</Empty>}
      {notes.map((note, index) => (
        <p key={index} className="rounded bg-amber-100 p-2 text-slate-900"><strong>{note.author}:</strong> {note.text}</p>
      ))}
      <form onSubmit={add} className="flex gap-2">
        <input required aria-label="Nota" className={inputClass} value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="submit">Añadir</Button>
      </form>
    </div>
  );
}
