import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { api, setCsrf } from "@/api/client";
import { Button, ErrorNote, Field, inputClass } from "@/shared/ui";

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
    <form onSubmit={submit} className="mx-auto mt-24 max-w-sm space-y-3 rounded-lg bg-ink-soft p-6">
      <h1 className="text-xl font-semibold">{setup ? "Crea tu cuenta de dueño" : "Entrar en CompanyAgentsHQ"}</h1>
      {setup && (
        <Field label="Nombre">
          <input required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
      )}
      <Field label="Correo">
        <input required type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </Field>
      <Field label="Contraseña (mínimo 8)">
        <input required minLength={8} type="password" className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </Field>
      <ErrorNote error={error} />
      <Button type="submit" tone="primary" className="w-full">
        {setup ? "Crear cuenta" : "Entrar"}
      </Button>
    </form>
  );
}

export function OnboardingPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", mission: "", sector: "", template: "default" });
  const [error, setError] = useState<unknown>(null);
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
    <form onSubmit={submit} className="mx-auto mt-24 max-w-md space-y-3 rounded-lg bg-ink-soft p-6">
      <h1 className="text-xl font-semibold">Monta tu empresa</h1>
      <Field label="Nombre de la empresa">
        <input required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Misión">
        <textarea className={inputClass} value={form.mission} onChange={(e) => setForm({ ...form, mission: e.target.value })} />
      </Field>
      <Field label="Sector">
        <input className={inputClass} value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} />
      </Field>
      <Field label="Plantilla">
        <select className={inputClass} value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })}>
          <option value="default">8 salas y 8 agentes</option>
          <option value="">Empresa vacía</option>
        </select>
      </Field>
      <ErrorNote error={error} />
      <Button type="submit" tone="primary" className="w-full">
        Crear empresa
      </Button>
    </form>
  );
}
