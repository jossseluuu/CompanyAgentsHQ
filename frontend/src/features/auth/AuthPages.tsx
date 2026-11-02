import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { api, setCsrf } from "@/api/client";
import { Button, ErrorNote, Field, inputClass } from "@/shared/ui";
import { t } from "@/shared/i18n";

export function LoginPage({ setup }: { setup: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<unknown>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const data = await api.post<{ csrf_token: string }>(
        setup ? "/auth/setup" : "/auth/login",
        setup ? form : { email: form.email, password: form.password },
      );
      setCsrf(data.csrf_token);
      await queryClient.invalidateQueries();
    } catch (failure) {
      setError(failure);
    }
  };
  return (
    <div className="auth-screen">
      <form onSubmit={submit} className="auth-card space-y-3 rounded-lg bg-ink-soft p-6">
      <p className="brand text-2xl">CompanyAgentsHQ</p>
      <h1 className="text-xl font-semibold">{setup ? t("Crea tu cuenta de dueño") : t("Entrar en CompanyAgentsHQ")}</h1>
      {setup && (
        <Field label={t("Nombre")}>
          <input required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
      )}
      <Field label={t("Correo")}>
        <input required type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </Field>
      <Field label={t("Contraseña (mínimo 8)")}>
        <input required minLength={8} type="password" className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </Field>
      <ErrorNote error={error} />
      <Button type="submit" tone="primary" className="w-full">
        {setup ? t("Crear cuenta") : t("Entrar")}
      </Button>
    </form>
    </div>
  );
}

export function OnboardingPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", mission: "", sector: "", template: "default" });
  const [error, setError] = useState<unknown>(null);
  const restore = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      await api.upload("/company/import", file);
      await queryClient.invalidateQueries();
    } catch (failure) {
      setError(failure);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api.post("/company", { ...form, template: form.template || null });
      await queryClient.invalidateQueries();
    } catch (failure) {
      setError(failure);
    }
  };
  return (
    <div className="auth-screen">
      <form onSubmit={submit} className="auth-card space-y-3 rounded-lg bg-ink-soft p-6">
      <p className="brand text-2xl">CompanyAgentsHQ</p>
      <h1 className="text-xl font-semibold">{t("Monta tu empresa")}</h1>
      <Field label={t("Nombre de la empresa")}>
        <input required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label={t("Misión")}>
        <textarea className={inputClass} value={form.mission} onChange={(e) => setForm({ ...form, mission: e.target.value })} />
      </Field>
      <Field label={t("Sector")}>
        <input className={inputClass} value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} />
      </Field>
      <Field label={t("Plantilla")}>
        <select className={inputClass} value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })}>
          <option value="default">{t("8 salas y 8 agentes")}</option>
          <option value="">{t("Empresa vacía")}</option>
        </select>
      </Field>
      <ErrorNote error={error} />
      <Button type="submit" tone="primary" className="w-full">
        {t("Crear empresa")}
      </Button>
          <label className="block cursor-pointer text-center text-sm underline">
        {t("Importar una empresa desde un ZIP")}
        <input type="file" accept=".zip" className="sr-only" onChange={(e) => restore(e.target.files?.[0])} />
      </label>
    </form>
    </div>
  );
}
