import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { api } from "@/api/client";
import type { Approval, Goal } from "@/api/types";
import type { ModuleProps } from "@/modules/registry";
import { Badge, Empty, statusLabel } from "@/shared/ui";

export function OwnerInbox(_: ModuleProps) {
  const goals = useQuery({ queryKey: ["goals"], queryFn: () => api.get<Goal[]>("/goals") });
  const approvals = useQuery({ queryKey: ["approvals", "pending"], queryFn: () => api.get<Approval[]>("/approvals?status=pending") });
  return (
    <div className="space-y-3 text-sm">
      <Link className="underline" to="/goals">Dar un objetivo nuevo</Link>
      <section>
        <h3 className="font-semibold">Objetivos</h3>
        {goals.data?.length === 0 && <Empty>Sin objetivos</Empty>}
        {goals.data?.map((goal) => (
          <Link key={goal.id} to={`/goals/${goal.id}`} className="flex justify-between rounded p-1 hover:bg-ink-soft">
            {goal.title} <Badge>{statusLabel(goal.status)}</Badge>
          </Link>
        ))}
      </section>
      <section>
        <h3 className="font-semibold">Aprobaciones pendientes</h3>
        {approvals.data?.length === 0 && <Empty>Nada pendiente</Empty>}
        {approvals.data?.map((item) => (
          <Link key={item.id} to="/approvals" className="block rounded p-1 hover:bg-ink-soft">
            {item.requester_name}: {item.action_type}
          </Link>
        ))}
      </section>
    </div>
  );
}
