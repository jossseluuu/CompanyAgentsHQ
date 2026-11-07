import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/api/client";
import type { PromptPreview } from "@/api/types";
import { Badge, Button, Empty, ErrorNote, Field, inputClass } from "@/shared/ui";
import { t } from "@/shared/i18n";

const SOURCES: Record<string, [string, string]> = {
  base: [t("Su prompt"), t("Se edita aquí arriba")],
  company: [t("Empresa"), t("Se edita en Ajustes")],
  personality: [t("Personalidad"), t("Se edita en Perfil")],
  rules: [t("Reglas de trabajo"), t("Fijas: las pone la aplicación")],
  security: [t("Seguridad"), t("Fijas: protegen frente a órdenes escondidas en ficheros")],
};

export function promptDiff(before: string, after: string) {
  const old = new Set(before.split("\n"));
  const current = new Set(after.split("\n"));
  return [
    ...before.split("\n").filter((l) => !current.has(l)).map((text) => ({ sign: "−", text })),
    ...after.split("\n").filter((l) => !old.has(l)).map((text) => ({ sign: "+", text })),
  ];
}

function PromptDiff({ before, after }: { before: string; after: string }) {
  const lines = promptDiff(before, after);
  if (!lines.length) return <p className="text-xs">{t("Sin cambios")}</p>;
  return <pre className="markdown text-xs">{lines.map((l) => `${l.sign} ${l.text}`).join("\n")}</pre>;
}

/** Lo que recibe de verdad el modelo, capa a capa, con el origen de cada una. */
function ModelView({ agentId, version }: { agentId: string; version: number }) {
  const { data } = useQuery({ queryKey: ["prompt-preview", agentId, version], queryFn: () => api.get<PromptPreview>(`/agents/${agentId}/prompt-preview`) });
  if (!data) return null;
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">{t("Lo que recibe el modelo")}</h3>
      {data.layers.map((layer, index) => {
        const [label, origin] = SOURCES[layer.source] ?? [layer.source, ""];
        return (
          <details key={index} open={layer.source !== "base"} className="rounded bg-ink-soft p-2">
            <summary className="flex cursor-pointer items-center justify-between gap-2">{label} <Badge>{origin}</Badge></summary>
            <pre className="markdown mt-1 whitespace-pre-wrap text-xs">{layer.text}</pre>
          </details>
        );
      })}
      <details className="rounded bg-ink-soft p-2">
        <summary className="cursor-pointer">{t("Herramientas que puede usar ahora ({0})", data.tools.length)}</summary>
        {data.tools.length === 0 && <Empty>{t("Ninguna")}</Empty>}
        {data.tools.map((tool) => (
          <details key={tool.name} className="mt-1">
            <summary className="cursor-pointer text-xs"><strong>{tool.name}</strong>: {tool.description}</summary>
            <pre className="markdown whitespace-pre-wrap text-xs">{JSON.stringify(tool.input_schema, null, 2)}</pre>
          </details>
        ))}
      </details>
      <details className="rounded bg-ink-soft p-2">
        <summary className="cursor-pointer">{t("Memoria que se añade a cada tarea")}</summary>
        {data.memory ? <pre className="markdown whitespace-pre-wrap text-xs">{data.memory}</pre> : <Empty>{t("Sin recuerdos")}</Empty>}
      </details>
      <details className="rounded bg-ink-soft p-2">
        <summary className="cursor-pointer">{t("Texto completo")}</summary>
        <pre className="markdown whitespace-pre-wrap text-xs">{data.system}</pre>
      </details>
    </section>
  );
}

export function PromptTab({ agentId, current, version, refresh }: { agentId: string; current: string; version: number; refresh: () => void }) {
  const [prompt, setPrompt] = useState(current);
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  const versions = useQuery({
    queryKey: ["prompt-versions", agentId],
    queryFn: () => api.get<{ version: number; note: string; author: string; system_prompt: string }[]>(`/agents/${agentId}/prompt-versions`),
  });
  const save = async (body: object) => {
    setError(null);
    try {
      await api.post(`/agents/${agentId}/prompt-versions`, body);
      await versions.refetch();
      refresh();
    } catch (failure) {
      setError(failure);
    }
  };
  const loadDefault = async () => {
    try {
      setPrompt((await api.get<{ system_prompt: string }>(`/agents/${agentId}/default-prompt`)).system_prompt);
    } catch (failure) {
      setError(failure);
    }
  };
  const dirty = prompt !== current;
  return (
    <div className="space-y-3 text-sm">
      <Field label={t("Prompt de sistema (versión {0})", version)}>
        <textarea className={`${inputClass} h-72 font-mono text-xs`} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </Field>
      <Field label={t("Nota de la versión")}>
        <input className={inputClass} placeholder={t("Qué cambia y por qué")} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorNote error={error} />
      <div className="flex flex-wrap gap-2">
        <Button tone="primary" disabled={!dirty || !prompt.trim()} onClick={() => save({ system_prompt: prompt, note: note || t("Editado desde la ficha") })}>{t("Guardar versión")}</Button>
        <Button disabled={!dirty} onClick={() => setPrompt(current)}>{t("Descartar cambios")}</Button>
        <Button onClick={loadDefault}>{t("Cargar el predeterminado")}</Button>
      </div>
      {dirty && (
        <details open>
          <summary className="cursor-pointer text-xs">{t("Cambios sin guardar")}</summary>
          <PromptDiff before={current} after={prompt} />
        </details>
      )}
      <ModelView agentId={agentId} version={version} />
      <details>
        <summary className="cursor-pointer">{t("Historial de versiones")}</summary>
        {versions.data?.map((entry) => (
          <div key={entry.version} className="mt-1 rounded bg-ink-soft p-2">
            <p className="flex items-center justify-between">
              v{entry.version} {entry.note}
              <Button onClick={() => save({ restore_version: entry.version })}>{t("Restaurar")}</Button>
            </p>
            <details>
              <summary className="text-xs">{t("Comparar con el actual")}</summary>
              <PromptDiff before={entry.system_prompt} after={prompt} />
            </details>
          </div>
        ))}
      </details>
    </div>
  );
}
