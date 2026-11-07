import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";

import { api } from "@/api/client";
import type { Snapshot } from "@/api/types";
import { language, type Language, setLanguage, t } from "@/shared/i18n";
import { currentTheme, setTheme, type Theme } from "@/shared/theme";
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
    sector: company.sector ?? "",
    timezone: company.timezone ?? "Europe/Madrid",
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
      <h2 className="font-semibold">{t("Empresa")}</h2>
      <Field label={t("Nombre")}><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label={t("Misión")}><textarea className={inputClass} value={form.mission} onChange={(e) => setForm({ ...form, mission: e.target.value })} /></Field>
      <Field label={t("Valores")}><textarea className={inputClass} value={form.values} onChange={(e) => setForm({ ...form, values: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("Sector")}><input className={inputClass} value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} /></Field>
        <Field label={t("Zona horaria")}><input className={inputClass} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("Límite diario (€)")}><input type="number" step="0.01" min="0" className={inputClass} value={form.daily_budget_eur} onChange={(e) => setForm({ ...form, daily_budget_eur: Number(e.target.value) })} /></Field>
        <Field label={t("Límite mensual (€)")}><input type="number" step="0.01" min="0" className={inputClass} value={form.monthly_budget_eur} onChange={(e) => setForm({ ...form, monthly_budget_eur: Number(e.target.value) })} /></Field>
      </div>
      <ErrorNote error={error} />
      <Button type="submit" tone="primary">{t("Guardar")}</Button>
      {saved && <span role="status" className="ml-2 text-sm">{t("Guardado")}</span>}
    </form>
  );
}

const EMBEDDING_NAME = /embed|bge|minilm|e5/i;

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
      <h2 className="font-semibold">{t("Modelos de IA")}</h2>
      <p className="text-sm text-slate-300">
        {t("Proveedor activo:")} <Badge>{data.llm_provider}</Badge> {t("· Embeddings:")} <Badge>{data.active_embeddings}</Badge>
      </p>
      {data.llm_provider === "fake" && (
        <p className="rounded bg-amber-950 p-2 text-sm text-amber-100">
          {t("Modo simulado: no se llama a ningún modelo. Pon LLM_PROVIDER=anthropic u ollama en .env para usar uno real.")}
        </p>
      )}
      <datalist id="models">
        <option value={data.defaults.powerful} />
        <option value={data.defaults.fast} />
        {localLlm.map((model) => <option key={model} value={model} />)}
      </datalist>
      <Field label={t("Modelo potente (por defecto {0})", data.defaults.powerful)}>
        <input list="models" className={inputClass} placeholder={t("ollama:llama3.2 u openai_compatible:mi-modelo")} value={form.powerful_model} onChange={(e) => setForm({ ...form, powerful_model: e.target.value })} />
      </Field>
      <Field label={t("Modelo rápido (por defecto {0})", data.defaults.fast)}>
        <input list="models" className={inputClass} value={form.fast_model} onChange={(e) => setForm({ ...form, fast_model: e.target.value })} />
      </Field>
      <Field label={t("Proveedor de embeddings")}>
        <select className={inputClass} value={form.embeddings_provider} onChange={(e) => setForm({ ...form, embeddings_provider: e.target.value })}>
          <option value="">{t("Por defecto")}</option>
          {data.embedding_providers.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </Field>
      <datalist id="embedding-models">
        {[...data.ollama_models.filter((model) => EMBEDDING_NAME.test(model)), ...data.downloaded_models].map((model) => <option key={model} value={model} />)}
      </datalist>
      <Field label={t("Modelo de embeddings (nombre o ruta local)")}>
        <input list="embedding-models" className={inputClass} placeholder={t("bge-m3")} value={form.embedding_model} onChange={(e) => setForm({ ...form, embedding_model: e.target.value })} />
      </Field>
      <p className="text-xs text-slate-300">
        {t("Modelos detectados en este equipo:")} {data.ollama_models.length} {t("en Ollama,")} {data.downloaded_models.length} {t("en Hugging Face. Al cambiar los embeddings se reindexa todo.")}
      </p>
      <Button type="submit" tone="primary">{t("Guardar modelos")}</Button>
    </form>
  );
}

function Preferences() {
  const client = useQueryClient();
  const [theme, pickTheme] = useState<Theme>(currentTheme);
  const { data: ai } = useQuery({ queryKey: ["ai"], queryFn: () => api.get<AiOverview>("/company/ai") });
  const lively = (ai?.settings as Record<string, unknown> | undefined)?.office_life !== false;
  const changeLanguage = async (next: Language) => {
    await api.patch("/company", { locale: next }).catch(() => undefined);
    setLanguage(next);
  };
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{t("Preferencias")}</h2>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("Idioma")}>
          <select className={inputClass} value={language} onChange={(e) => changeLanguage(e.target.value as Language)}>
            <option value="es">{t("Español")}</option>
            <option value="en">{t("Inglés")}</option>
          </select>
        </Field>
        <Field label={t("Tema")}>
          <select
            className={inputClass}
            value={theme}
            onChange={(e) => {
              pickTheme(e.target.value as Theme);
              setTheme(e.target.value as Theme);
            }}
          >
            <option value="dark">{t("Oscuro")}</option>
            <option value="light">{t("Claro")}</option>
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={lively}
          onChange={async (e) => {
            await api.patch("/company/ai", { office_life: e.target.checked });
            await client.invalidateQueries({ queryKey: ["ai"] });
          }}
        />
        {t("Vida en la oficina: quien no trabaja pasea y charla. No gasta modelo.")}
      </label>
    </section>
  );
}

function Backup() {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{t("Copia de seguridad")}</h2>
      <p className="text-sm text-slate-300">
        {t("Descarga la empresa completa en un ZIP: configuración, historial y ficheros. Se restaura en una instalación nueva al crear la empresa.")}
      </p>
      <a className="inline-block rounded border border-ink-line bg-ink-soft px-2.5 py-1 text-sm hover:bg-ink-line" href="/api/v1/company/export" download>
        {t("Exportar empresa")}
      </a>
    </section>
  );
}

function DangerZone({ name }: { name: string }) {
  const [form, setForm] = useState({ confirm_name: "", password: "" });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const erase = async (event: FormEvent) => {
    event.preventDefault();
    if (!window.confirm(t("¿Eliminar {0} para siempre? No se puede deshacer.", name))) return;
    setError(null);
    setBusy(true);
    try {
      await api.delete("/company", form);
      window.location.assign("/");
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={erase} className="space-y-2 rounded border border-red-800 p-3">
      <h2 className="font-semibold text-red-300">{t("Eliminar la empresa")}</h2>
      <p className="text-sm text-slate-300">
        {t("Borra para siempre la oficina, los agentes, sus prompts y memoria, las tareas, los objetivos, los ficheros, el conocimiento, las finanzas y la auditoría. Tu cuenta se conserva. Si quieres guardar algo, exporta antes la empresa.")}
      </p>
      <Field label={t("Escribe «{0}» para confirmar", name)}>
        <input autoComplete="off" className={inputClass} value={form.confirm_name} onChange={(e) => setForm({ ...form, confirm_name: e.target.value })} />
      </Field>
      <Field label={t("Tu contraseña")}>
        <input type="password" autoComplete="current-password" className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </Field>
      <ErrorNote error={error} />
      <Button type="submit" tone="danger" disabled={busy || form.confirm_name !== name || !form.password}>{t("Eliminar todo")}</Button>
    </form>
  );
}

export function SettingsPage() {
  const { data } = useQuery({ queryKey: ["snapshot"], queryFn: () => api.get<Snapshot>("/company") });
  return (
    <div className="page max-w-2xl">
      <h1 className="page-title">{t("Ajustes")}</h1>
      {data && <CompanyForm key={data.id} company={data} />}
      <AiForm />
      <Preferences />
      <Backup />
      {data && <DangerZone name={data.name} />}
    </div>
  );
}
