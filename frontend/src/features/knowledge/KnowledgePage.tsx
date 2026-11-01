import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { api } from "@/api/client";
import type { Citation, KbDocument, KnowledgeBase } from "@/api/types";
import { Badge, Button, Empty, Field, inputClass } from "@/shared/ui";
import { t } from "@/shared/i18n";

export function BaseDetail({ base }: { base: KnowledgeBase }) {
  const client = useQueryClient();
  const { data: documents = [] } = useQuery({
    queryKey: ["kb-documents", base.id],
    queryFn: () => api.get<KbDocument[]>(`/knowledge-bases/${base.id}/documents`),
  });
  const [note, setNote] = useState({ title: "", text: "" });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Citation[] | null>(null);
  const addNote = async (event: FormEvent) => {
    event.preventDefault();
    await api.post(`/knowledge-bases/${base.id}/documents`, note);
    setNote({ title: "", text: "" });
    await client.invalidateQueries({ queryKey: ["kb-documents", base.id] });
  };
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold">{base.name}</h2>
        <Button onClick={() => api.post(`/knowledge-bases/${base.id}/reindex`)}>{t("Reindexar")}</Button>
      </div>
      <ul>
        {documents.map((document) => (
          <li key={document.id} className="flex items-center gap-2 border-b border-ink-line py-1">
            <span className="flex-1">{document.title}</span>
            <Badge>{document.status === "indexed" ? `${document.chunks} fragmentos` : document.status}</Badge>
          </li>
        ))}
      </ul>
      {documents.length === 0 && <Empty>{t("Sin documentos")}</Empty>}
      <form onSubmit={addNote} className="space-y-1">
        <Field label={t("Título de la nota")}>
          <input required className={inputClass} value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} />
        </Field>
        <Field label={t("Texto")}>
          <textarea required className={inputClass} value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} />
        </Field>
        <Button type="submit">{t("Añadir")}</Button>
      </form>
      <form
        className="flex gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setResults(await api.post<Citation[]>(`/knowledge-bases/${base.id}/query`, { query }));
        }}
      >
        <input aria-label={t("Probar una consulta")} className={inputClass} placeholder={t("Probar una consulta")} value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button type="submit">{t("Probar")}</Button>
      </form>
      {results?.map((item) => (
        <p key={item.n} className="text-xs">
          <Badge>{item.score}</Badge> <strong>{item.document}</strong>: {item.fragment}
        </p>
      ))}
      {results?.length === 0 && <Empty>{t("Ningún fragmento coincide")}</Empty>}
    </div>
  );
}

export function KnowledgePage() {
  const { data: bases = [] } = useQuery({ queryKey: ["knowledge-bases"], queryFn: () => api.get<KnowledgeBase[]>("/knowledge-bases") });
  const [selected, setSelected] = useState<string | null>(null);
  const base = bases.find((b) => b.id === selected);
  return (
    <div className="flex h-full min-h-0">
      <aside className="w-72 shrink-0 overflow-y-auto border-r border-ink-line p-3 text-sm">
        <h1 className="mb-2 text-lg font-semibold">{t("Bases de conocimiento")}</h1>
        {bases.map((item) => (
          <button key={item.id} className="flex w-full justify-between rounded p-1 text-left hover:bg-ink-soft" onClick={() => setSelected(item.id)}>
            <span>{item.name}</span>
            <span className="text-slate-300">{item.documents}</span>
          </button>
        ))}
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto p-4">{base ? <BaseDetail base={base} /> : <Empty>{t("Elige una base")}</Empty>}</div>
    </div>
  );
}
