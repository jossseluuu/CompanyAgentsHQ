import type { AgentStatus } from "@/api/types";

/** Cada estado lleva icono y texto: nunca se comunica solo por color (RNF-USA-03). */
export const STATUS: Record<AgentStatus, { icon: string; label: string; tone: string }> = {
  idle: { icon: "zZ", label: "Inactivo", tone: "bg-slate-700 text-slate-100" },
  walking: { icon: "👣", label: "Caminando", tone: "bg-slate-700 text-slate-100" },
  thinking: { icon: "…", label: "Pensando", tone: "bg-indigo-800 text-indigo-50" },
  working: { icon: "⚙", label: "Trabajando", tone: "bg-sky-800 text-sky-50" },
  reviewing: { icon: "🔍", label: "Revisando", tone: "bg-violet-800 text-violet-50" },
  meeting: { icon: "💬", label: "En reunión", tone: "bg-fuchsia-800 text-fuchsia-50" },
  resting: { icon: "☕", label: "Descansando", tone: "bg-amber-800 text-amber-50" },
  waiting_approval: { icon: "!", label: "Espera decisión", tone: "bg-yellow-400 text-slate-900" },
  flagged: { icon: "🛡", label: "Anomalía", tone: "bg-orange-600 text-white" },
  error: { icon: "✕", label: "Error", tone: "bg-red-700 text-white" },
  paused: { icon: "⏸", label: "En pausa", tone: "bg-slate-500 text-white" },
};
