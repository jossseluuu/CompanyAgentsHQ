import { AnomalyList, EventLog } from "@/features/audit/AuditPage";
import type { ModuleProps } from "@/modules/registry";

export function AuditPanel(_: ModuleProps) {
  return (
    <div className="space-y-3">
      <AnomalyList />
      <EventLog limit={40} />
    </div>
  );
}
