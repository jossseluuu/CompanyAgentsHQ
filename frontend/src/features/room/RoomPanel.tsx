import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/api/client";
import type { Room } from "@/api/types";
import { MODULE_PANELS } from "@/modules/registry";
import { Badge, Button, Empty, ErrorNote, inputClass, Tabs } from "@/shared/ui";
import { useOffice } from "@/store/office";
import { t } from "@/shared/i18n";

interface CatalogEntry {
  key: string;
  name: string;
  description: string;
}

interface AgentAccess {
  agent_id: string;
  name: string;
  home: boolean;
  custom: boolean;
  can_enter: boolean;
  can_use_tools: boolean;
}

const RULES: Record<string, { label: string; can_enter: boolean; can_use_tools: boolean }> = {
  allow: { label: t("Permitir"), can_enter: true, can_use_tools: true },
  enter: { label: t("Solo entrar"), can_enter: true, can_use_tools: false },
  deny: { label: t("Denegar"), can_enter: false, can_use_tools: false },
};

const ruleOf = (entry: AgentAccess) => (!entry.custom ? "" : !entry.can_enter ? "deny" : entry.can_use_tools ? "allow" : "enter");

const summary = (entry: AgentAccess) => (!entry.can_enter ? t("No entra") : entry.can_use_tools ? t("Entra y usa la sala") : t("Solo entra"));

/** Muestra lo que tiene cada agente: una regla propia manda sobre lo que diga la sala. */
function AccessList({ room, run }: { room: Room; run: (action: () => Promise<unknown>) => Promise<void> }) {
  const client = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["room-access", room.id], queryFn: () => api.get<AgentAccess[]>(`/rooms/${room.id}/access`) });
  const change = (entry: AgentAccess, rule: string) =>
    run(async () => {
      if (rule) {
        const { can_enter, can_use_tools } = RULES[rule];
        await api.put(`/rooms/${room.id}/access`, { agent_id: entry.agent_id, can_enter, can_use_tools });
      } else {
        await api.del(`/rooms/${room.id}/access/${entry.agent_id}`);
      }
      await client.invalidateQueries({ queryKey: ["room-access", room.id] });
    });
  return (
    <section className="space-y-1">
      <h3 className="font-semibold">{t("Acceso a la sala")}</h3>
      <p className="text-xs text-slate-300">
        {room.restricted ? t("Sala restringida: por defecto solo entra quien la tiene de sala base.") : t("Sala abierta: por defecto entra todo el equipo.")}{" "}
        {t("Sin acceso, el agente no entra ni toca sus ficheros, y si está dentro vuelve a su puesto.")}
      </p>
      {data.map((entry) => (
        <div key={entry.agent_id} className="flex items-center justify-between gap-2 py-0.5">
          <span className="min-w-0">
            {entry.name}
            <span className="block text-xs text-slate-300">{summary(entry)}</span>
          </span>
          {entry.home ? (
            <Badge>{t("Sala base")}</Badge>
          ) : (
            <select aria-label={t("Acceso de {0}", entry.name)} className={`${inputClass} w-40`} value={ruleOf(entry)} onChange={(e) => change(entry, e.target.value)}>
              <option value="">{t("Como la sala")}</option>
              {Object.entries(RULES).map(([key, rule]) => <option key={key} value={key}>{rule.label}</option>)}
            </select>
          )}
        </div>
      ))}
    </section>
  );
}

function ModuleManager({ room }: { room: Room }) {
  const client = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["catalog"], queryFn: () => api.get<CatalogEntry[]>("/modules/catalog") });
  const [error, setError] = useState<unknown>(null);
  const installed = new Set(room.modules.map((m) => m.module_key));
  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await client.invalidateQueries({ queryKey: ["room", room.id] });
      await client.invalidateQueries({ queryKey: ["snapshot"] });
    } catch (failure) {
      setError(failure);
    }
  };
  return (
    <div className="space-y-3 text-sm">
      <ErrorNote error={error} />
      <ul className="space-y-1">
        {data.map((entry) => (
          <li key={entry.key} className="flex items-center justify-between gap-2 rounded bg-ink-soft p-2">
            <span>
              {entry.name}
              <span className="block text-xs text-slate-300">{entry.description}</span>
            </span>
            {installed.has(entry.key) ? (
              <Button onClick={() => run(() => api.del(`/rooms/${room.id}/modules/${entry.key}`))}>{t("Quitar")}</Button>
            ) : (
              <Button onClick={() => run(() => api.post(`/rooms/${room.id}/modules`, { module_key: entry.key }))}>{t("Instalar")}</Button>
            )}
          </li>
        ))}
      </ul>
      <AccessList room={room} run={run} />
    </div>
  );
}

const MANAGE = "__manage";

export function RoomPanel({ roomId }: { roomId: string }) {
  const tab = useOffice((s) => s.selectedTab);
  const { openRoom } = useOffice.getState();
  const { data: room } = useQuery({ queryKey: ["room", roomId], queryFn: () => api.get<Room>(`/rooms/${roomId}`) });
  if (!room) return null;
  const moduleTab = room.modules.some((m) => m.module_key === tab) ? tab! : room.modules[0]?.module_key;
  const active = tab === MANAGE ? MANAGE : (moduleTab ?? MANAGE);
  const Panel = MODULE_PANELS[active];
  const module = room.modules.find((m) => m.module_key === active);
  return (
    <aside aria-label={t("Sala {0}", room.name)} className="flex w-[30rem] max-w-[45vw] shrink-0 flex-col border-l border-ink-line bg-ink">
      <header className="flex items-center justify-between p-2">
        <h2 className="font-semibold">{room.name}</h2>
        <Button aria-label={t("Cerrar sala")} onClick={() => openRoom(null)}>✕</Button>
      </header>
      <Tabs
        tabs={[...room.modules.map((m) => ({ key: m.module_key, label: m.name })), { key: MANAGE, label: "⚙ Módulos" }]}
        active={active}
        onChange={(key) => openRoom(room.id, key)}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {active === MANAGE && <ModuleManager room={room} />}
        {active !== MANAGE && (Panel && module ? <Panel room={room} module={module} /> : <Empty>{t("Este módulo no tiene panel")}</Empty>)}
      </div>
    </aside>
  );
}
