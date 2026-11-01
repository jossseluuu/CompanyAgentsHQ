import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { OfficeView } from "@/office/OfficeView";
import { Button } from "@/shared/ui";
import { useOffice } from "@/store/office";
import { t } from "@/shared/i18n";

const INVALIDATIONS: Record<string, string[][]> = {
  "task.updated": [["board"], ["goals"], ["goal"], ["tasks"], ["profile"]],
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
  const links = [
    ["/", t("Oficina")],
    ["/goals", t("Objetivos")],
    ["/approvals", t("Aprobaciones")],
    ["/audit", t("Auditoría")],
    ["/org", t("Organigrama")],
    ["/knowledge", t("Conocimiento")],
    ["/settings", t("Ajustes")],
  ];
  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-ink-line bg-ink-soft px-3 py-1.5 text-sm">
        <strong className="text-base">{data?.company ?? t("CompanyAgentsHQ")}</strong>
        <nav aria-label={t("Principal")} className="flex gap-1">
          {links.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => `rounded px-2 py-0.5 ${isActive ? "bg-indigo-600 text-white" : "hover:bg-ink-line"}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <span className="ml-auto tabular-nums" data-testid="spend">
          {data?.simulated ? t("Gasto simulado") : t("Gasto hoy")}: {(data?.spend_today_eur ?? 0).toFixed(3)} € / {(data?.daily_limit_eur ?? 0).toFixed(2)} €
        </span>
        <button className="underline" onClick={() => navigate("/approvals")}>
          {t("Aprobaciones:")} {data?.pending_approvals ?? 0}
        </button>
        <button className="underline" onClick={() => navigate("/audit")}>
          {t("Anomalías:")} {data?.open_anomalies ?? 0}
        </button>
        <span className={connected ? "text-emerald-300" : "text-amber-300"}>{connected ? t("● En vivo") : t("○ Reconectando")}</span>
        <Button onClick={() => setSearching(true)}>{t("Buscar (/)")}</Button>
        <NotificationsButton />
        <Button tone={paused ? "primary" : "danger"} onClick={toggle}>
          {paused ? t("▶ Reanudar") : t("⏸ Pausa general")}
        </Button>
      </header>
      <main className="min-h-0 flex-1">
        <Routes>
          <Route path="/" element={<OfficeView />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/goals/:id" element={<GoalsPage />} />
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
