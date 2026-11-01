import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, fileUrl } from "@/api/client";
import type { FileRow } from "@/api/types";
import type { ModuleProps } from "@/modules/registry";
import { Button, Empty, ErrorNote, inputClass } from "@/shared/ui";
import { useOffice } from "@/store/office";

export function FilingCabinet({ room }: ModuleProps) {
  const client = useQueryClient();
  const agents = useOffice((s) => s.agents);
  const rooms = useOffice((s) => s.snapshot?.office.rooms ?? []);
  const [filters, setFilters] = useState({ ext: "", sort: "created_at", trash: false });
  const [error, setError] = useState<unknown>(null);
  const [preview, setPreview] = useState<FileRow | null>(null);
  const params = new URLSearchParams({ sort: filters.sort, trash: String(filters.trash), ...(filters.ext ? { ext: filters.ext } : {}) });
  const { data = [] } = useQuery({
    queryKey: ["files", room.id, params.toString()],
    queryFn: () => api.get<FileRow[]>(`/rooms/${room.id}/files?${params}`),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["files"] });
  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await refresh();
    } catch (failure) {
      setError(failure);
    }
  };
  const upload = (files: FileList | null) =>
    run(async () => {
      for (const file of Array.from(files ?? [])) await api.upload(`/rooms/${room.id}/files`, file);
    });
  return (
    <div className="space-y-2 text-sm" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}>
      <label className="block cursor-pointer rounded border border-dashed border-ink-line p-3 text-center text-slate-300">
        Suelta ficheros aquí o pulsa para subirlos
        <input type="file" multiple className="sr-only" onChange={(e) => upload(e.target.files)} />
      </label>
      <ErrorNote error={error} />
      <div className="flex gap-2">
        <input aria-label="Filtrar por tipo" className={inputClass} placeholder="Tipo (pdf, md…)" value={filters.ext} onChange={(e) => setFilters({ ...filters, ext: e.target.value })} />
        <select aria-label="Ordenar" className={inputClass} value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
          <option value="created_at">Fecha</option>
          <option value="name">Nombre</option>
          <option value="size">Tamaño</option>
        </select>
        <Button onClick={() => setFilters({ ...filters, trash: !filters.trash })}>{filters.trash ? "Ficheros" : "Papelera"}</Button>
      </div>
      {data.length === 0 && <Empty>{filters.trash ? "Papelera vacía" : "Sin ficheros"}</Empty>}
      <ul className="space-y-1">
        {data.map((file) => (
          <li key={file.id} className="rounded bg-ink-soft p-2">
            <button className="underline" onClick={() => setPreview(file)}>{file.name}</button>
            <span className="ml-2 text-xs text-slate-300">
              v{file.version} · {(file.size_bytes / 1024).toFixed(1)} KB · {agents[file.created_by_agent_id ?? ""]?.name ?? "Dueño"}
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              <a className="rounded border border-ink-line px-2 py-0.5 text-xs" href={fileUrl(file.id)}>Descargar</a>
              {filters.trash ? (
                <Button onClick={() => run(() => api.post(`/files/${file.id}/restore`))}>Restaurar</Button>
              ) : (
                <Button onClick={() => run(() => api.del(`/files/${file.id}`))}>A la papelera</Button>
              )}
              <select
                aria-label={`Mover ${file.name}`}
                className="rounded bg-slate-950 text-xs"
                value=""
                onChange={(e) => e.target.value && run(() => api.post(`/files/${file.id}/move`, { room_id: e.target.value }))}
              >
                <option value="">Mover a…</option>
                {rooms.filter((r) => r.id !== room.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <select
                aria-label={`Copiar ${file.name}`}
                className="rounded bg-slate-950 text-xs"
                value=""
                onChange={(e) => e.target.value && run(() => api.post(`/files/${file.id}/copy`, { room_id: e.target.value }))}
              >
                <option value="">Copiar a…</option>
                {rooms.filter((r) => r.id !== room.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </li>
        ))}
      </ul>
      {preview && (
        <div className="space-y-1">
          <div className="flex justify-between"><strong>{preview.name}</strong><Button onClick={() => setPreview(null)}>Cerrar</Button></div>
          <iframe title={`Vista previa de ${preview.name}`} src={fileUrl(preview.id, true)} sandbox="" className="h-72 w-full rounded bg-white" />
        </div>
      )}
    </div>
  );
}
