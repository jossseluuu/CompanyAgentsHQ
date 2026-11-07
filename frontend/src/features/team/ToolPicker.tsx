import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/api/client";
import type { ToolInfo } from "@/api/types";
import { Badge, Button, ErrorNote, inputClass } from "@/shared/ui";
import { t } from "@/shared/i18n";

const GROUPS: Record<string, string> = {
  files: t("Ficheros"),
  research: t("Investigación"),
  team: t("Equipo y tareas"),
  finance: t("Finanzas"),
  control: t("Control y aprobaciones"),
  other: t("Otras"),
};

const READING = ["search_files", "read_file", "search_knowledge", "ask_manager"];
const PRESETS: [string, string[]][] = [
  [t("Solo lectura"), READING],
  [t("Redactor"), [...READING, "write_file", "web_search"]],
  [t("Mando intermedio"), [...READING, "write_file", "web_search", "delegate_task", "create_task", "update_task", "request_approval"]],
];

/** Todas las herramientas por áreas: qué hacen, qué riesgo tienen y por qué alguna no se puede usar aún. */
export function ToolPicker({ value, usable, roomId, onChange }: { value: string[]; usable?: string[]; roomId?: string | null; onChange: (tools: string[]) => void }) {
  const { data = [] } = useQuery({ queryKey: ["tool-catalog"], queryFn: () => api.get<ToolInfo[]>("/tools/catalog") });
  const [text, setText] = useState("");
  const [error, setError] = useState<unknown>(null);
  const needle = text.trim().toLowerCase();
  const shown = data.filter((tool) => !needle || `${tool.name} ${tool.description}`.toLowerCase().includes(needle));
  const blocked = usable ? value.filter((name) => !usable.includes(name)).length : 0;
  const sensitive = data.filter((tool) => tool.sensitive && value.includes(tool.name)).length;
  const install = async (key: string) => {
    setError(null);
    try {
      await api.post(`/rooms/${roomId}/modules`, { module_key: key });
      onChange(value);
    } catch (failure) {
      setError(failure);
    }
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-300">{t("{0} de {1} activas · {2} bloqueadas · {3} sensibles", value.length, data.length, blocked, sensitive)}</p>
      <div className="flex flex-wrap gap-1">
        {PRESETS.map(([label, tools]) => <Button key={label} onClick={() => onChange(tools)}>{label}</Button>)}
      </div>
      <input aria-label={t("Buscar herramienta")} placeholder={t("Buscar herramienta")} className={inputClass} value={text} onChange={(e) => setText(e.target.value)} />
      <ErrorNote error={error} />
      {Object.entries(GROUPS).map(([group, title]) => {
        const tools = shown.filter((tool) => (tool.group ?? "other") === group);
        if (!tools.length) return null;
        return (
          <section key={group} className="space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{title}</h4>
            <ul className="space-y-1">
              {tools.map((tool) => {
                const active = value.includes(tool.name);
                const missing = active && usable !== undefined && !usable.includes(tool.name);
                return (
                  <li key={tool.name} className="rounded bg-ink-soft p-1.5">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={active}
                        onChange={() => onChange(active ? value.filter((name) => name !== tool.name) : [...value, tool.name])}
                      />
                      <span className="min-w-0">
                        <span className="font-medium">{tool.name}</span>{" "}
                        {tool.sensitive && <Badge>{t("pide tu aprobación")}</Badge>}{" "}
                        {missing && <Badge>{t("sin módulo en su sala")}</Badge>}
                        <span className="block text-xs text-slate-300">{tool.description}</span>
                        {!tool.core && tool.modules.length > 0 && <span className="block text-xs text-slate-400">{t("Requiere en su sala:")} {tool.modules.join(", ")}</span>}
                      </span>
                    </label>
                    {missing && roomId && tool.module_keys?.[0] && (
                      <Button className="mt-1" onClick={() => install(tool.module_keys![0])}>{t("Instalar {0} en su sala", tool.modules[0])}</Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
