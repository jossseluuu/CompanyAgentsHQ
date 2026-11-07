import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { api } from "@/api/client";
import type { Room } from "@/api/types";
import { Button, ErrorNote, Field, inputClass } from "@/shared/ui";
import { useOffice } from "@/store/office";
import { t } from "@/shared/i18n";

import { ToolPicker } from "./ToolPicker";

interface RoleGroup {
  name: string;
  roles: { key: string; code: string; title: string; description: string; model?: string; tools: string[] }[];
}

const OTHER_ROLE = "__other";
const BASE_TOOLS = ["search_files", "read_file", "write_file", "search_knowledge", "ask_manager"];

/** Contrata viendo desde el principio qué sabrá y qué podrá hacer el agente. */
export function HireForm({ room, onDone }: { room?: Room; onDone?: () => void }) {
  const client = useQueryClient();
  const { data: catalog } = useQuery({ queryKey: ["role-catalog"], queryFn: () => api.get<{ groups: RoleGroup[] }>("/role-catalog") });
  const [choice, setChoice] = useState("");
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const matching = catalog?.groups
    .map((group) => ({ ...group, roles: group.roles.filter((r) => !needle || `${r.code} ${r.title} ${group.name}`.toLowerCase().includes(needle)) }))
    .filter((group) => group.roles.length > 0);
  const chosen = catalog?.groups.flatMap((g) => g.roles).find((r) => r.key === choice);
  const snapshot = useOffice((s) => s.snapshot);
  const agents = useOffice((s) => s.agents);
  const [form, setForm] = useState({ name: "", role: "", home_room_id: room?.id ?? "", manager_id: "", department_id: "", model: "fast", personality: "" });
  const [tools, setTools] = useState<string[] | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const role = chosen?.key ?? (choice === OTHER_ROLE ? form.role : "");
  const standard = useQuery({
    queryKey: ["default-prompt", role],
    enabled: Boolean(role),
    queryFn: () => api.get<{ system_prompt: string }>(`/role-catalog/default-prompt?role=${encodeURIComponent(role)}`),
  });
  const shownTools = tools ?? chosen?.tools ?? BASE_TOOLS;
  const fixedRoom = Boolean(chosen && !room);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await api.post("/agents", {
        ...form,
        name: form.name.trim() || null,
        manager_id: form.manager_id || null,
        home_room_id: fixedRoom ? null : form.home_room_id,
        department_id: fixedRoom ? null : form.department_id || null,
        role,
        model: chosen?.model ?? form.model,
        tools: shownTools,
        system_prompt: prompt,
      });
      setForm({ ...form, name: "", role: "", personality: "" });
      setChoice("");
      setTools(null);
      setPrompt(null);
      await client.invalidateQueries({ queryKey: ["org"] });
      await client.invalidateQueries({ queryKey: ["snapshot"] });
      onDone?.();
    } catch (failure) {
      setError(failure);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-2 rounded bg-ink-soft p-3">
      <h2 className="font-semibold">{room ? t("Contratar en {0}", room.name) : t("Contratar agente")}</h2>
      <Field label={t("Buscar cargo")}><input className={inputClass} placeholder={t("Título, indicativo o área")} value={search} onChange={(e) => setSearch(e.target.value)} /></Field>
      <Field label={t("Cargo")}>
        <select
          required
          className={inputClass}
          value={choice}
          onChange={(e) => {
            setChoice(e.target.value);
            setTools(null);
            setPrompt(null);
          }}
        >
          <option value="">{t("Elige cargo")}</option>
          {matching?.map((group) => (
            <optgroup key={group.name} label={group.name}>
              {group.roles.map((r) => <option key={r.key} value={r.key}>{r.code} · {r.title}</option>)}
            </optgroup>
          ))}
          <option value={OTHER_ROLE}>{t("Otro cargo…")}</option>
        </select>
      </Field>
      <Field label={t("Nombre")}><input className={inputClass} placeholder={chosen?.code ?? t("Si lo dejas vacío, su indicativo")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      {chosen && <p className="text-xs text-slate-300">{chosen.description} {fixedRoom && t("Irá a la sala de su área.")}</p>}
      {choice === OTHER_ROLE && <Field label={t("Rol")}><input required className={inputClass} placeholder={t("seo, contable…")} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></Field>}
      {!fixedRoom && (
        <>
          {!room && (
            <Field label={t("Sala base")}>
              <select required className={inputClass} value={form.home_room_id} onChange={(e) => setForm({ ...form, home_room_id: e.target.value })}>
                <option value="">{t("Elige sala")}</option>
                {snapshot?.office.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
          )}
          <Field label={t("Departamento")}>
            <select className={inputClass} value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
              <option value="">{t("Sin departamento")}</option>
              {snapshot?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
        </>
      )}
      <Field label={t("Jefe")}>
        <select className={inputClass} value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })}>
          <option value="">{t("Sin jefe")}</option>
          {Object.values(agents).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label={t("Modelo")}><input className={inputClass} value={chosen?.model ?? form.model} disabled={Boolean(chosen?.model)} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
      <Field label={t("Personalidad y tono")}>
        <input className={inputClass} placeholder={t("Directa y cercana")} value={form.personality} onChange={(e) => setForm({ ...form, personality: e.target.value })} />
      </Field>
      <details>
        <summary className="cursor-pointer text-sm">{t("Prompt y herramientas ({0})", shownTools.length)}</summary>
        <div className="mt-2 space-y-2">
          <Field label={t("Prompt de sistema")}>
            <textarea className={`${inputClass} h-40 font-mono text-xs`} placeholder={t("Elige un cargo para ver su prompt")} value={prompt ?? standard.data?.system_prompt ?? ""} onChange={(e) => setPrompt(e.target.value)} />
          </Field>
          <ToolPicker value={shownTools} onChange={setTools} />
        </div>
      </details>
      <ErrorNote error={error} />
      <Button type="submit" tone="primary">{t("Contratar")}</Button>
    </form>
  );
}

export function HireDialog({ room, onClose }: { room?: Room; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={t("Contratar agente")} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6">
      <div className="w-full max-w-lg space-y-2 rounded border border-ink-line bg-ink p-3">
        <div className="flex justify-end"><Button aria-label={t("Cerrar")} onClick={onClose}>✕</Button></div>
        <HireForm room={room} onDone={onClose} />
      </div>
    </div>
  );
}
