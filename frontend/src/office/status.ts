import type { AgentStatus } from "@/api/types";
import { t } from "@/shared/i18n";

/** Cada estado lleva icono y texto: nunca se comunica solo por color (RNF-USA-03). */
export const STATUS: Record<AgentStatus, { icon: string; label: string; tone: string }> = {
  idle: { icon: "zZ", label: t("Inactivo"), tone: "bg-slate-700 text-slate-50" },
  walking: { icon: "👣", label: t("Caminando"), tone: "bg-slate-700 text-slate-50" },
  thinking: { icon: "…", label: t("Pensando"), tone: "bg-indigo-800 text-indigo-50" },
  working: { icon: "⚙", label: t("Trabajando"), tone: "bg-sky-800 text-sky-50" },
  reviewing: { icon: "🔍", label: t("Revisando"), tone: "bg-violet-800 text-violet-50" },
  meeting: { icon: "💬", label: t("En reunión"), tone: "bg-fuchsia-800 text-fuchsia-50" },
  resting: { icon: "☕", label: t("Descansando"), tone: "bg-amber-800 text-amber-50" },
  waiting_approval: { icon: "!", label: t("Espera decisión"), tone: "bg-yellow-400 text-black" },
  flagged: { icon: "🛡", label: t("Anomalía"), tone: "bg-orange-600 text-white" },
  error: { icon: "✕", label: t("Error"), tone: "bg-red-700 text-white" },
  paused: { icon: "⏸", label: t("En pausa"), tone: "bg-slate-500 text-white" },
};
