import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Building2, ListChecks, type LucideIcon, Network, ScrollText, Settings, ShieldCheck, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";

import { api, setCsrf } from "@/api/client";
import type { Snapshot, StatusBar } from "@/api/types";
import { EventSocket, type ServerEvent } from "@/api/ws";
import { ApprovalsPage } from "@/features/approvals/ApprovalsPage";
import { AuditPage } from "@/features/audit/AuditPage";
import { GoalsPage } from "@/features/goals/GoalsPage";
import { KnowledgePage } from "@/features/knowledge/KnowledgePage";
import { LoginPage, OnboardingPage } from "@/features/auth/AuthPages";
import { NotificationsButton } from "@/features/notifications/Notifications";
import { OrgChartPage } from "@/features/org-chart/OrgChartPage";
import { SearchDialog } from "@/features/search/SearchDialog";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { TasksPage } from "@/features/tasks/TasksPage";
import { OfficeView } from "@/office/OfficeView";
import { Button } from "@/shared/ui";
import { useOffice } from "@/store/office";
import { t } from "@/shared/i18n";

const INVALIDATIONS: Record<string, string[][]> = {
  "task.updated": [["board"], ["goals"], ["goal"], ["tasks"], ["profile"]],
  "agent.updated": [["org"]],
  "goal.updated": [["goals"], ["goal"]],
  "file.created": [["files"]],
  "file.deleted": [["files"]],
  "approval.created": [["approvals"], ["status-bar"], ["notifications"]],
  "approval.decided": [["approvals"], ["status-bar"]],
  "cost.updated": [["status-bar"], ["finance"]],
  "audit.anomaly": [["anomalies"], ["status-bar"], ["notifications"]],
  "knowledge.indexed": [["kb-documents"], ["knowledge-bases"]],
  "module.updated": [["room"], ["finance"], ["snapshot"]],
  "notification.created": [["notifications"]],
  "agent.message_done": [["messages"], ["profile"]],
  "room.created": [["snapshot"]],
  "room.updated": [["snapshot"]],
  "room.deleted": [["snapshot"]],
};

function Shell() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searching, setSearching] = useState(false);
  const paused = useOffice((s) => s.paused);
  const connected = useOffice((s) => s.connected);
  const snapshot = useQuery({ queryKey: ["snapshot"], queryFn: () => api.get<Snapshot>("/company") });
  const bar = useQuery({ queryKey: ["status-bar"], queryFn: () => api.get<StatusBar>("/company/status-bar") });

  useEffect(() => {
    if (snapshot.data) useOffice.getState().setSnapshot(snapshot.data);
  }, [snapshot.data]);

  useEffect(() => {
    const socket = new EventSocket((event: ServerEvent) => {
      useOffice.getState().applyEvent(event.type, event.data, performance.now());
      INVALIDATIONS[event.type]?.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
    });
    socket.connect();
    return () => socket.close();
  }, [queryClient]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = async () => {
    await api.post(paused ? "/company/resume" : "/company/pause");
    await queryClient.invalidateQueries({ queryKey: ["status-bar"] });
  };
  const data = bar.data;
  const links: [string, string, LucideIcon][] = [
    ["/", t("Oficina"), Building2],
    ["/goals", t("Objetivos"), Target],
    ["/tasks", t("Tareas"), ListChecks],
    ["/approvals", t("Aprobaciones"), ShieldCheck],
    ["/audit", t("Auditoría"), ScrollText],
    ["/org", t("Organigrama"), Network],
    ["/knowledge", t("Conocimiento"), BookOpen],
    ["/settings", t("Ajustes"), Settings],
  ];
  const spent = data ? Math.min((data.spend_today_eur / (data.daily_limit_eur || 1)) * 100, 100) : 0;
  return (
    <div className="flex h-full">
      <aside className="flex w-14 shrink-0 flex-col border-r border-ink-line bg-ink-soft lg:w-52">
        <div className="px-3 py-3">
          <p className="brand hidden text-lg leading-tight lg:block">CompanyAgentsHQ</p>
          <p className="brand text-center text-lg lg:hidden" aria-hidden>HQ</p>
          <p className="mt-0.5 hidden truncate text-xs text-slate-400 lg:block">{data?.company}</p>
        </div>
        <nav aria-label={t("Principal")} className="flex flex-1 flex-col gap-0.5 px-2">
          {links.map(([to, label, Icon]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              aria-label={label}
              title={label}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded px-2.5 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-indigo-600 text-white shadow-sm" : "text-slate-300 hover:bg-ink-line hover:text-slate-50"
                }`
              }
            >
              <Icon size={17} aria-hidden />
              <span className="hidden lg:inline">{label}</span>
            </NavLink>
          ))}
        </nav>
        <p className={`hidden px-4 py-3 text-xs font-medium lg:block ${connected ? "text-emerald-300" : "text-amber-300"}`}>
          {connected ? t("● En vivo") : t("○ Reconectando")}
        </p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-ink-line bg-ink-soft px-4 py-2 text-sm">
          <div className="tabular-nums" data-testid="spend">
            <span className="text-xs text-slate-300">
              {data?.simulated ? t("Gasto simulado") : t("Gasto hoy")}: {(data?.spend_today_eur ?? 0).toFixed(3)} € / {(data?.daily_limit_eur ?? 0).toFixed(2)} €
            </span>
            <div className="meter mt-1"><span style={{ width: `${spent}%` }} /></div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button className="rounded px-2 py-1 text-slate-200 hover:bg-ink-line" onClick={() => navigate("/approvals")}>
              {t("Aprobaciones:")} <strong>{data?.pending_approvals ?? 0}</strong>
            </button>
            <button className="rounded px-2 py-1 text-slate-200 hover:bg-ink-line" onClick={() => navigate("/audit")}>
              {t("Anomalías:")} <strong>{data?.open_anomalies ?? 0}</strong>
            </button>
            <Button onClick={() => setSearching(true)}>{t("Buscar (/)")}</Button>
            <NotificationsButton />
            <Button tone={paused ? "primary" : "danger"} onClick={toggle}>
              {paused ? t("▶ Reanudar") : t("⏸ Pausa general")}
            </Button>
          </div>
        </header>
      <main className="min-h-0 flex-1">
        <Routes>
          <Route path="/" element={<OfficeView />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/goals/:id" element={<GoalsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/org" element={<OrgChartPage />} />
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      {searching && <SearchDialog onClose={() => setSearching(false)} />}
      </div>
    </div>
  );
}

export function App() {
  const status = useQuery({ queryKey: ["auth-status"], queryFn: () => api.get<{ needs_setup: boolean }>("/auth/status") });
  const me = useQuery({
    queryKey: ["me"],
    enabled: status.data !== undefined && !status.data.needs_setup,
    retry: false,
    queryFn: async () => {
      const data = await api.get<{ name: string; csrf_token: string }>("/auth/me");
      setCsrf(data.csrf_token);
      return data;
    },
  });
  const company = useQuery({
    queryKey: ["company-exists"],
    enabled: Boolean(me.data),
    queryFn: () => api.get<{ exists: boolean; templates: string[] }>("/company/exists"),
  });
  if (status.isLoading || (me.isLoading && me.fetchStatus !== "idle")) return <p className="p-6">{t("Cargando…")}</p>;
  if (status.isError) return <p className="p-6">{t("No se puede contactar con el servidor.")}</p>;
  if (status.data?.needs_setup || !me.data) return <LoginPage setup={Boolean(status.data?.needs_setup)} />;
  if (company.isLoading) return <p className="p-6">{t("Cargando…")}</p>;
  if (!company.data?.exists) return <OnboardingPage />;
  return <Shell />;
}
