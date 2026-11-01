import type { ModuleProps } from "@/modules/registry";
import { Empty } from "@/shared/ui";
import { useOffice } from "@/store/office";
import { t } from "@/shared/i18n";

export function BreakArea(_: ModuleProps) {
  const agents = useOffice((s) => s.agents);
  const resting = Object.values(agents).filter((a) => a.status === "resting");
  if (!resting.length) return <Empty>{t("Nadie está descansando")}</Empty>;
  return (
    <ul className="space-y-1 text-sm">
      {resting.map((agent) => (
        <li key={agent.id} className="rounded bg-ink-soft p-2">
          <span aria-hidden>☕</span> {agent.name}
          {agent.resting_since && ` desde las ${new Date(agent.resting_since).toLocaleTimeString()}`}
        </li>
      ))}
    </ul>
  );
}
