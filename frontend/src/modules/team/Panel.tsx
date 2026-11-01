import type { ModuleProps } from "@/modules/registry";
import { STATUS } from "@/office/status";
import { Button, Empty } from "@/shared/ui";
import { useOffice } from "@/store/office";

export function Team({ room }: ModuleProps) {
  const agents = useOffice((s) => s.agents);
  const here = Object.values(agents).filter((a) => a.home_room_id === room.id || a.current_room_id === room.id);
  if (!here.length) return <Empty>Sala sin agentes</Empty>;
  return (
    <ul className="space-y-1 text-sm">
      {here.map((agent) => (
        <li key={agent.id} className="flex items-center justify-between rounded bg-ink-soft p-2">
          <span>{agent.name} · {agent.role}</span>
          <span className="flex items-center gap-1 text-xs">
            <span aria-hidden>{STATUS[agent.status].icon}</span> {STATUS[agent.status].label}
            <Button onClick={() => useOffice.getState().openAgent(agent.id)}>Ficha</Button>
          </span>
        </li>
      ))}
    </ul>
  );
}
