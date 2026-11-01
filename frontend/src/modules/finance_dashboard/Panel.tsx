import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { api } from "@/api/client";
import type { ModuleProps } from "@/modules/registry";
import { BarChart, Button, ErrorNote, inputClass } from "@/shared/ui";
import { t } from "@/shared/i18n";

interface Dashboard {
  income_eur: number;
  expense_eur: number;
  ai_eur: number;
  forecast_eur: number;
  monthly_limit_eur: number;
  ai_by_day: { day: string; cost_eur: number }[];
  ai_by_agent: { agent_id: string; name: string; cost_eur: number }[];
  budget_vs_real: { category: string; budget_eur: number; real_eur: number }[];
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-ink-soft p-2">
      <p className="text-xs text-slate-300">{label}</p>
      <p className="text-lg tabular-nums">{value.toFixed(2)} €</p>
    </div>
  );
}

export function FinanceDashboard({ module }: ModuleProps) {
  const client = useQueryClient();
  const { data } = useQuery({ queryKey: ["finance"], queryFn: () => api.get<Dashboard>("/finance/dashboard") });
  const [budget, setBudget] = useState({ category: "", amount_eur: "" });
  const [error, setError] = useState<unknown>(null);
  if (!data) return null;
  const refresh = () => client.invalidateQueries({ queryKey: ["finance"] });
  const addBudget = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api.post("/finance/budgets", { ...budget, period: new Date().toISOString().slice(0, 7) });
      setBudget({ category: "", amount_eur: "" });
      await refresh();
    } catch (failure) {
      setError(failure);
    }
  };
  const importCsv = async (file?: File) => {
    if (!file) return;
    try {
      await api.upload("/finance/entries/import", file);
      await refresh();
    } catch (failure) {
      setError(failure);
    }
  };
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-slate-300">{t("Moneda:")} {module.config.currency}</p>
      <div className="grid grid-cols-2 gap-2">
        <Tile label={t("Ingresos del mes")} value={data.income_eur} />
        <Tile label={t("Gastos del mes")} value={data.expense_eur} />
        <Tile label={t("Gasto de IA")} value={data.ai_eur} />
        <Tile label={t("Previsión de IA a fin de mes")} value={data.forecast_eur} />
      </div>
      <BarChart title={t("Gasto de IA por día")} rows={data.ai_by_day.map((d) => ({ label: d.day, value: d.cost_eur }))} />
      <BarChart title={t("Gasto de IA por agente")} rows={data.ai_by_agent.map((a) => ({ label: a.name, value: a.cost_eur }))} />
      <section>
        <h3 className="font-semibold">{t("Presupuesto frente a real")}</h3>
        <table className="w-full text-left text-xs">
          <thead className="text-slate-300"><tr><th>{t("Partida")}</th><th className="text-right">{t("Presupuesto")}</th><th className="text-right">{t("Real")}</th></tr></thead>
          <tbody>
            {data.budget_vs_real.map((row) => (
              <tr key={row.category}>
                <td>{row.category}</td>
                <td className="text-right tabular-nums">{row.budget_eur.toFixed(2)} €</td>
                <td className="text-right tabular-nums">{row.real_eur.toFixed(2)} €</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <form onSubmit={addBudget} className="flex gap-2">
        <input required aria-label={t("Partida")} className={inputClass} placeholder={t("Partida")} value={budget.category} onChange={(e) => setBudget({ ...budget, category: e.target.value })} />
        <input required aria-label={t("Importe")} type="number" min="0" step="0.01" className={inputClass} placeholder={t("Importe")} value={budget.amount_eur} onChange={(e) => setBudget({ ...budget, amount_eur: e.target.value })} />
        <Button type="submit">{t("Añadir")}</Button>
      </form>
      <label className="block cursor-pointer rounded border border-dashed border-ink-line p-2 text-center text-slate-300">
        {t("Importar CSV (fecha, categoria, importe, tipo)")}
        <input type="file" accept=".csv" className="sr-only" onChange={(e) => importCsv(e.target.files?.[0])} />
      </label>
      <a className="underline" href="/api/v1/finance/export">{t("Exportar CSV")}</a>
      <ErrorNote error={error} />
    </div>
  );
}
