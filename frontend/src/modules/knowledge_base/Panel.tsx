import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { KnowledgeBase } from "@/api/types";
import { BaseDetail } from "@/features/knowledge/KnowledgePage";
import type { ModuleProps } from "@/modules/registry";
import { Empty } from "@/shared/ui";

export function KnowledgeBasePanel({ room }: ModuleProps) {
  const { data = [] } = useQuery({ queryKey: ["knowledge-bases"], queryFn: () => api.get<KnowledgeBase[]>("/knowledge-bases") });
  const base = data.find((b) => b.scope === "room" && b.scope_id === room.id);
  return base ? <BaseDetail base={base} /> : <Empty>Esta sala no tiene base</Empty>;
}
