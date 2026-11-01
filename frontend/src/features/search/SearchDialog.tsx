import { type FormEvent, useEffect, useRef, useState } from "react";

import { api, fileUrl } from "@/api/client";
import type { Agent, Citation, FileRow, Task } from "@/api/types";
import { Button, Empty, ErrorNote, inputClass } from "@/shared/ui";
import { useOffice } from "@/store/office";

interface Results {
  files: (FileRow & { snippet: string })[];
  tasks: Task[];
  agents: Agent[];
  knowledge: Citation[];
}

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<unknown>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setResults(await api.post<Results>("/search", { query }));
    } catch (failure) {
      setError(failure);
    }
  };
  const empty = results && !results.files.length && !results.tasks.length && !results.agents.length && !results.knowledge.length;
  return (
    <div role="dialog" aria-label="Buscador global" className="fixed inset-0 z-50 flex justify-center bg-black/60 p-10" onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-lg bg-ink-soft p-4" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit} className="flex gap-2">
          <input ref={input} aria-label="Buscar" className={inputClass} placeholder="Ficheros, tareas, agentes, conocimiento…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button type="submit" tone="primary">Buscar</Button>
        </form>
        <ErrorNote error={error} />
        {empty && <Empty>Sin resultados</Empty>}
        {results && (
          <div className="mt-3 space-y-3 text-sm">
            {results.agents.map((agent) => (
              <button key={agent.id} className="block underline" onClick={() => { useOffice.getState().openAgent(agent.id); onClose(); }}>
                Agente: {agent.name} ({agent.role})
              </button>
            ))}
            {results.files.map((file) => (
              <a key={file.id} className="block" href={fileUrl(file.id, true)} target="_blank" rel="noreferrer">
                <span className="underline">{file.name}</span>
                <span className="block text-slate-300">{file.snippet}</span>
              </a>
            ))}
            {results.tasks.map((task) => (
              <p key={task.id}>Tarea: {task.title}</p>
            ))}
            {results.knowledge.map((item) => (
              <p key={item.n}>
                <strong>{item.document}</strong>
                {item.page ? `, pág. ${item.page}` : ""}: <span className="text-slate-300">{item.fragment.slice(0, 200)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
