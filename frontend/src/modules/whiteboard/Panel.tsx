import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { api } from "@/api/client";
import type { ModuleProps } from "@/modules/registry";
import { Button, Empty, inputClass } from "@/shared/ui";
import { t } from "@/shared/i18n";

export function Whiteboard({ room, module }: ModuleProps) {
  const client = useQueryClient();
  const [text, setText] = useState("");
  const notes: { author: string; text: string }[] = module.config.notes ?? [];
  const add = async (event: FormEvent) => {
    event.preventDefault();
    await api.patch(`/rooms/${room.id}/modules/whiteboard`, { notes: [...notes, { author: t("Dueño"), text }] });
    setText("");
    await client.invalidateQueries({ queryKey: ["room", room.id] });
  };
  return (
    <div className="space-y-2 text-sm">
      {notes.length === 0 && <Empty>{t("Pizarra vacía")}</Empty>}
      {notes.map((note, index) => (
        <p key={index} className="rounded bg-amber-100 p-2 text-black"><strong>{note.author}:</strong> {note.text}</p>
      ))}
      <form onSubmit={add} className="flex gap-2">
        <input required aria-label={t("Nota")} className={inputClass} value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="submit">{t("Añadir")}</Button>
      </form>
    </div>
  );
}
