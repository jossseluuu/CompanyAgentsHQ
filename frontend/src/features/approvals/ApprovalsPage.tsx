import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/api/client";
import type { Approval, Trace } from "@/api/types";
import { Badge, Button, Empty, inputClass } from "@/shared/ui";
import { t } from "@/shared/i18n";

function ApprovalCard({ item }: { item: Approval }) {
  const client = useQueryClient();
  const [comment, setComment] = useState("");
  const [showTrace, setShowTrace] = useState(false);
  const trace = useQuery({
    queryKey: ["trace", item.task_id],
    enabled: showTrace && Boolean(item.task_id),
    queryFn: () => api.get<Trace[]>(`/tasks/${item.task_id}/trace`),
  });
  const decide = async (approve: boolean) => {
    await api.post(`/approvals/${item.id}/decision`, { approve, comment });
    await client.invalidateQueries({ queryKey: ["approvals"] });
    await client.invalidateQueries({ queryKey: ["status-bar"] });
  };
  return (
    <article className="space-y-2 rounded border border-ink-line bg-ink-soft p-3 text-sm">
      <header className="flex justify-between">
        <strong>{item.requester_name} {t("pide:")} {item.action_type}</strong>
        <Badge>{item.status}</Badge>
      </header>
      <pre className="markdown max-h-40 overflow-y-auto rounded bg-slate-950 p-2 text-xs">{JSON.stringify(item.payload.input ?? item.payload.reason ?? item.payload, null, 1)}</pre>
      {item.task_id && <Button onClick={() => setShowTrace(!showTrace)}>{t("Ver la traza")}</Button>}
      {showTrace &&
        trace.data?.map((step) => (
          <p key={step.id} className="text-xs text-slate-300">
            {t("Paso")} {step.step} · {step.model}: {step.output.slice(0, 160)} {step.tool_calls.map((c) => c.name).join(", ")}
          </p>
        ))}
      {item.status === "pending" && item.approver_agent_id === null && (
        <div className="flex gap-2">
          <input aria-label={t("Comentario")} className={inputClass} placeholder={t("Comentario")} value={comment} onChange={(e) => setComment(e.target.value)} />
          <Button tone="primary" onClick={() => decide(true)}>{t("Aprobar")}</Button>
          <Button tone="danger" onClick={() => decide(false)}>{t("Rechazar")}</Button>
        </div>
      )}
    </article>
  );
}

export function ApprovalsPage() {
  const pending = useQuery({ queryKey: ["approvals", "pending"], queryFn: () => api.get<Approval[]>("/approvals?status=pending") });
  const history = useQuery({ queryKey: ["approvals", "all"], queryFn: () => api.get<Approval[]>("/approvals") });
  const decided = history.data?.filter((a) => a.status !== "pending") ?? [];
  return (
    <div className="mx-auto h-full max-w-3xl space-y-3 overflow-y-auto p-4">
      <h1 className="page-title">{t("Bandeja de aprobaciones")}</h1>
      {pending.data?.length === 0 && <Empty>{t("No hay decisiones pendientes")}</Empty>}
      {pending.data?.map((item) => <ApprovalCard key={item.id} item={item} />)}
      {decided.length > 0 && <h2 className="font-semibold">{t("Decididas")}</h2>}
      {decided.map((item) => <ApprovalCard key={item.id} item={item} />)}
    </div>
  );
}
