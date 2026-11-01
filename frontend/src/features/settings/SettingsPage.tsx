import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";

import { api } from "@/api/client";
import type { Snapshot } from "@/api/types";
import { Badge, Button, ErrorNote, Field, inputClass } from "@/shared/ui";

interface AiOverview {
  settings: Record<string, string>;
  llm_provider: string;
  defaults: { powerful: string; fast: string };
  active_embeddings: string;
  ollama_models: string[];
  downloaded_models: string[];
  embedding_providers: string[];
}

function CompanyForm({ company }: { company: Snapshot }) {
  const client = useQueryClient();
  const [form, setForm] = useState({
    name: company.name,
    mission: company.mission,
    values: company.values,
    daily_budget_eur: company.daily_budget_eur,
    monthly_budget_eur: company.monthly_budget_eur,
  });
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api.patch("/company", form);
      setSaved(true);
      await client.invalidateQueries({ queryKey: ["snapshot"] });
      await client.invalidateQueries({ queryKey: ["status-bar"] });
    } catch (failure) {
      setError(failure);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <h2 className="font-semibold">Empresa</h2>
      <Field label="Nombre"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Misión"><textarea className={inputClass} value={form.mission} onChange={(e) => setForm({ ...form, mission: e.target.value })} /></Field>
      <Field label="Valores"><textarea className={inputClass} value={form.values} onChange={(e) => setForm({ ...form, values: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Límite diario (€)"><input type="number" step="0.01" min="0" className={inputClass} value={form.daily_budget_eur} onChange={(e) => setForm({ ...form, daily_budget_eur: Number(e.target.value) })} /></Field>
        <Field label="Límite mensual (€)"><input type="number" step="0.01" min="0" className={inputClass} value={form.monthly_budget_eur} onChange={(e) => setForm({ ...form, monthly_budget_eur: Number(e.target.value) })} /></Field>
      </div>
      <ErrorNote error={error} />
      <Button type="submit" tone="primary">Guardar</Button>
      {saved && <span role="status" className="ml-2 text-sm">Guardado</span>}
    </form>
  );
}

function AiForm() {
  const client = useQueryClient();
  const { data } = useQuery({ queryKey: ["ai"], queryFn: () => api.get<AiOverview>("/company/ai") });
  const [form, setForm] = useState({ powerful_model: "", fast_model: "", embeddings_provider: "", embedding_model: "" });
  useEffect(() => {
    if (data) setForm((f) => ({ ...f, ...data.settings }));
  }, [data]);
  if (!data) return null;
  const localLlm = data.ollama_models.map((m) => `ollama:${m}`);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    await api.patch("/company/ai", form);
    await client.invalidateQueries({ queryKey: ["ai"] });
  };
  return (
    <form onSubmit={save} className="space-y-2">
      <h2 className="font-semibold">Modelos de IA</h2>
      <p className="text-sm text-slate-300">
        Proveedor activo: <Badge>{data.llm_provider}</Badge> · Embeddings: <Badge>{data.active_embeddings}</Badge>
      </p>
      {data.llm_provider === "fake" && (
        <p className="rounded bg-amber-950 p-2 text-sm text-amber-100">
          Modo simulado: no se llama a ningún modelo. Pon LLM_PROVIDER=anthropic u ollama en .env para usar uno real.
        </p>
      )}
      <datalist id="models">
        <option value={data.defaults.powerful} />
        <option value={data.defaults.fast} />
        {localLlm.map((model) => <option key={model} value={model} />)}
      </datalist>
      <Field label={`Modelo potente (por defecto ${data.defaults.powerful})`}>
        <input list="models" className={inputClass} placeholder="ollama:llama3.2 u openai_compatible:mi-modelo" value={form.powerful_model} onChange={(e) => setForm({ ...form, powerful_model: e.target.value })} />
      </Field>
      <Field label={`Modelo rápido (por defecto ${data.defaults.fast})`}>
        <input list="models" className={inputClass} value={form.fast_model} onChange={(e) => setForm({ ...form, fast_model: e.target.value })} />
      </Field>
      <Field label="Proveedor de embeddings">
        <select className={inputClass} value={form.embeddings_provider} onChange={(e) => setForm({ ...form, embeddings_provider: e.target.value })}>
          <option value="">Por defecto</option>
          {data.embedding_providers.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </Field>
      <datalist id="embedding-models">
        {[...data.ollama_models, ...data.downloaded_models].map((model) => <option key={model} value={model} />)}
      </datalist>
      <Field label="Modelo de embeddings (nombre o ruta local)">
        <input list="embedding-models" className={inputClass} placeholder="bge-m3" value={form.embedding_model} onChange={(e) => setForm({ ...form, embedding_model: e.target.value })} />
      </Field>
      <p className="text-xs text-slate-300">
        Modelos detectados en este equipo: {data.ollama_models.length} en Ollama, {data.downloaded_models.length} en Hugging Face. Al cambiar los embeddings se reindexa todo.
      </p>
      <Button type="submit" tone="primary">Guardar modelos</Button>
    </form>
  );
}

export function SettingsPage() {
  const { data } = useQuery({ queryKey: ["snapshot"], queryFn: () => api.get<Snapshot>("/company") });
  return (
    <div className="mx-auto h-full max-w-2xl space-y-6 overflow-y-auto p-4">
      <h1 className="text-lg font-semibold">Ajustes</h1>
      {data && <CompanyForm key={data.id} company={data} />}
      <AiForm />
    </div>
  );
}
