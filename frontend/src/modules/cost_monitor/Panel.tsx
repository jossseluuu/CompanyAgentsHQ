import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { StatusBar } from "@/api/types";
import type { ModuleProps } from "@/modules/registry";

export function CostMonitor(_: ModuleProps) {
  const { data } = useQuery({ queryKey: ["status-bar"], queryFn: () => api.get<StatusBar>("/company/status-bar") });
  if (!data) return null;
  const ratio = data.daily_limit_eur ? Math.min(data.spend_today_eur / data.daily_limit_eur, 1) : 0;
  return (
    <div className="space-y-2 text-sm">
      <p className="text-3xl tabular-nums">{data.spend_today_eur.toFixed(3)} €</p>
      <p className="text-slate-300">de {data.daily_limit_eur.toFixed(2)} € de hoy ({Math.round(ratio * 100)} %)</p>
      <div role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Gasto del día" className="h-2 rounded bg-ink-soft">
        <div className="h-2 rounded bg-indigo-400" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
