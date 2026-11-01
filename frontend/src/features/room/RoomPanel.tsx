import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/api/client";
import type { Room } from "@/api/types";
import { MODULE_PANELS } from "@/modules/registry";
import { Button, Empty, ErrorNote, Tabs } from "@/shared/ui";
import { useOffice } from "@/store/office";

interface CatalogEntry {
  key: string;
  name: string;
  description: string;
}

function ModuleManager({ room }: { room: Room }) {
  const client = useQueryClient();
  const agents = useOffice((s) => s.agents);
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
              <Button onClick={() => run(() => api.del(`/rooms/${room.id}/modules/${entry.key}`))}>Quitar</Button>
            ) : (
              <Button onClick={() => run(() => api.post(`/rooms/${room.id}/modules`, { module_key: entry.key }))}>Instalar</Button>
            )}
          </li>
        ))}
      </ul>
      <section>
        <h3 className="font-semibold">Acceso a la sala</h3>
        {Object.values(agents).map((agent) => (
          <div key={agent.id} className="flex items-center justify-between py-0.5">
            {agent.name}
            <span className="flex gap-1">
              <Button onClick={() => run(() => api.put(`/rooms/${room.id}/access`, { agent_id: agent.id, can_enter: true, can_use_tools: true }))}>Permitir</Button>
              <Button onClick={() => run(() => api.put(`/rooms/${room.id}/access`, { agent_id: agent.id, can_enter: false, can_use_tools: false }))}>Denegar</Button>
            </span>
          </div>
        ))}
      </section>
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
    <aside aria-label={`Sala ${room.name}`} className="flex w-[30rem] max-w-[45vw] shrink-0 flex-col border-l border-ink-line bg-ink">
      <header className="flex items-center justify-between p-2">
        <h2 className="font-semibold">{room.name}</h2>
        <Button aria-label="Cerrar sala" onClick={() => openRoom(null)}>✕</Button>
      </header>
      <Tabs
        tabs={[...room.modules.map((m) => ({ key: m.module_key, label: m.name })), { key: MANAGE, label: "⚙ Módulos" }]}
        active={active}
        onChange={(key) => openRoom(room.id, key)}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {active === MANAGE && <ModuleManager room={room} />}
        {active !== MANAGE && (Panel && module ? <Panel room={room} module={module} /> : <Empty>Este módulo no tiene panel</Empty>)}
      </div>
    </aside>
  );
}
