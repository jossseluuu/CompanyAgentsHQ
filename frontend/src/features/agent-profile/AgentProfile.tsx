import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { api } from "@/api/client";
import type { Anomaly, Citation, Message, Task, Trace } from "@/api/types";
import { STATUS } from "@/office/status";
import type { Tile } from "@/office/pathAnimator";
import { ToolPicker } from "@/features/team/ToolPicker";
import { Badge, BarChart, Button, Empty, ErrorNote, Field, inputClass, statusLabel, Tabs } from "@/shared/ui";
import { useOffice } from "@/store/office";
import { t } from "@/shared/i18n";

import { PromptTab } from "./PromptTab";

export { promptDiff } from "./PromptTab";

const TABS = [
  ["profile", t("Perfil")],
  ["prompt", t("Prompt")],
  ["capabilities", t("Capacidades")],
  ["knowledge", t("Conocimiento")],
  ["work", t("Trabajo")],
  ["performance", t("Rendimiento")],
  ["cost", t("Coste")],
  ["memory", t("Memoria")],
  ["audit", t("Auditoría")],
  ["chat", t("Chat")],
].map(([key, label]) => ({ key, label }));

interface Profile {
  agent: any;
  profile: { prompt: { version: number; system_prompt: string }; reports: { id: string; name: string }[] };
  capabilities: { tools: string[]; usable_now: string[]; supervised_by: { kind: string; supervisor_id: string }[] };
  knowledge: { base_id: string; name: string; scope: string; can_read: boolean; can_write: boolean }[];
  work: { current: Task | null; queue: Task[]; finished: Task[] };
  performance: { completed: number; failed: number; accepted_first_pct: number | null; avg_seconds: number | null; avg_steps: number | null };
  cost: { by_day: { day: string; cost_eur: number }[]; by_task: { task_id: string; cost_eur: number; tokens: number }[]; tokens: { input: number; output: number }; today_eur: number; budget_eur: number };
  memory: { id: string; summary: string }[];
  audit: { traces: Trace[]; anomalies: Anomaly[] };
}

const SITUATIONS: Record<string, string> = { resting: t("Al descansar"), meeting: t("En reunión"), reading: t("Al consultar ficheros") };
const PLACES: Record<string, string> = { workplace: t("Su puesto"), break: t("Sala de descanso"), boardroom: t("Sala de juntas"), cabinet: t("Archivador") };

function RoutineForm({ agentId }: { agentId: string }) {
  const { data, refetch } = useQuery({
    queryKey: ["routine", agentId],
    queryFn: () => api.get<{ rules: Record<string, string>; defaults: Record<string, string>; targets: string[] }>(`/agents/${agentId}/routine`),
  });
  if (!data) return null;
  const change = async (situation: string, place: string) => {
    await api.put(`/agents/${agentId}/routine`, { ...data.rules, [situation]: place });
    await refetch();
  };
  return (
    <fieldset className="space-y-1 rounded border border-ink-line p-2">
      <legend className="px-1">{t("Rutina")}</legend>
      {Object.entries(SITUATIONS).map(([situation, label]) => (
        <Field key={situation} label={label}>
          <select className={inputClass} value={data.rules[situation] ?? data.defaults[situation]} onChange={(e) => change(situation, e.target.value)}>
            {data.targets.map((place) => <option key={place} value={place}>{PLACES[place] ?? place}</option>)}
          </select>
        </Field>
      ))}
    </fieldset>
  );
}

function ProfileTab({ data, refresh }: { data: Profile; refresh: () => void }) {
  const [error, setError] = useState<unknown>(null);
  const agent = data.agent;
  const rooms = useOffice((s) => s.snapshot?.office.rooms ?? []);
  const colleagues = Object.values(useOffice.getState().agents);
  const departments = useOffice.getState().snapshot?.departments ?? [];
  const update = (body: object) => api.patch(`/agents/${agent.id}`, body).then(refresh).catch(setError);
  const local = useQuery({ queryKey: ["company-ai"], queryFn: () => api.get<{ ollama_models: string[] }>("/company/ai") });
  return (
    <div className="space-y-2 text-sm">
      <p>{t("Rol:")} {agent.role}</p>
      <Field label={t("Nombre")}>
        <input className={inputClass} defaultValue={agent.name} onBlur={(e) => e.target.value && update({ name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("Jefe")}>
          <select className={inputClass} value={agent.manager_id ?? ""} onChange={(e) => update({ manager_id: e.target.value || null })}>
            <option value="">{t("Sin jefe")}</option>
            {colleagues.filter((a) => a.id !== agent.id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label={t("Departamento")}>
          <select className={inputClass} value={agent.department_id ?? ""} onChange={(e) => update({ department_id: e.target.value || null })}>
            <option value="">{t("Sin departamento")}</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label={t("Presupuesto diario (€)")}>
        <input type="number" step="0.1" min="0" className={inputClass} defaultValue={agent.daily_budget_eur} onBlur={(e) => update({ daily_budget_eur: e.target.value })} />
      </Field>
      <Field label={t("Modelo (fast, powerful o proveedor:modelo)")}>
        <input list="agent-models" className={inputClass} defaultValue={agent.model} onBlur={(e) => update({ model: e.target.value })} />
      </Field>
      <datalist id="agent-models">
        {["fast", "powerful", ...(local.data?.ollama_models ?? []).map((m) => `ollama:${m}`)].map((model) => <option key={model} value={model} />)}
      </datalist>
      <Field label={t("Temperatura (solo modelos locales)")}>
        <input type="number" step="0.1" min="0" max="1" className={inputClass} defaultValue={agent.temperature} onBlur={(e) => update({ temperature: Number(e.target.value) })} />
      </Field>
      <Field label={t("Trasladar a la sala")}>
        <select className={inputClass} value={agent.home_room_id ?? ""} onChange={(e) => update({ home_room_id: e.target.value })}>
          {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
        </select>
      </Field>
      <Field label={t("Personalidad y tono")}>
        <textarea className={inputClass} placeholder={t("Directa y cercana")} defaultValue={agent.personality} onBlur={(e) => update({ personality: e.target.value })} />
      </Field>
      <RoutineForm agentId={agent.id} />
      <ErrorNote error={error} />
    </div>
  );
}

function ChatTab({ agentId }: { agentId: string }) {
  const client = useQueryClient();
  const stream = useOffice((s) => s.streams[agentId]);
  const { data = [] } = useQuery({ queryKey: ["messages", agentId], queryFn: () => api.get<Message[]>(`/agents/${agentId}/messages`) });
  const [text, setText] = useState("");
  const [error, setError] = useState<unknown>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.();
  }, [data, stream]);
  const send = async () => {
    if (!text.trim()) return;
    const content = text;
    setText("");
    try {
      await api.post(`/agents/${agentId}/messages`, { content });
      await client.invalidateQueries({ queryKey: ["messages", agentId] });
    } catch (failure) {
      setError(failure);
    }
  };
  return (
    <div className="flex h-full flex-col gap-2 text-sm">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto" aria-live="polite">
        {data.length === 0 && <Empty>{t("Escribe al agente")}</Empty>}
        {data.map((message) => (
          <div key={message.id} className={`rounded p-2 ${message.role === "owner" ? "ml-8 bg-indigo-900 text-white" : "mr-8 bg-ink-soft"}`}>
            <p className="markdown">{message.content}</p>
            {message.citations.map((c: Citation) => (
              <p key={c.n} className="mt-1 text-xs text-slate-300">
                [{c.n}] {c.document}{c.page ? `, pág. ${c.page}` : ""}
              </p>
            ))}
          </div>
        ))}
        {stream && <div className="mr-8 rounded bg-ink-soft p-2"><p className="markdown">{stream}</p></div>}
        <div ref={end} />
      </div>
      <ErrorNote error={error} />
      <div className="flex gap-2">
        <textarea
          aria-label={t("Mensaje")}
          className={inputClass}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button tone="primary" onClick={send}>{t("Enviar")}</Button>
      </div>
    </div>
  );
}

function TaskList({ title, tasks }: { title: string; tasks: Task[] }) {
  return (
    <section>
      <h3 className="font-semibold">{title}</h3>
      {tasks.length === 0 && <Empty>{t("Nada")}</Empty>}
      {tasks.map((task) => (
        <p key={task.id} className="flex justify-between gap-2 py-0.5">{task.title} <Badge>{statusLabel(task.status)}</Badge></p>
      ))}
    </section>
  );
}

/** La llamada exacta al modelo: se carga al abrirla porque puede ocupar mucho. */
function TraceContext({ agentId, traceId }: { agentId: string; traceId: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["trace", traceId],
    enabled: open,
    queryFn: () => api.get<{ context: Record<string, unknown> }>(`/agents/${agentId}/traces/${traceId}`),
  });
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-xs">{t("Ver lo que se envió al modelo")}</summary>
      {data && <pre className="markdown whitespace-pre-wrap text-xs">{JSON.stringify(data.context, null, 2)}</pre>}
    </details>
  );
}

function TraceView({ agentId, trace }: { agentId: string; trace: Trace }) {
  return (
    <details className="rounded bg-ink-soft p-2">
      <summary>{trace.kind} {t("paso")} {trace.step} · {trace.model} · v{trace.prompt_version} · {trace.input_tokens + trace.output_tokens} {t("tokens ·")} {trace.latency_ms} {t("ms")}</summary>
      <p className="markdown mt-1 text-xs">{trace.output}</p>
      {trace.tool_calls.map((call, index) => <p key={index} className="text-xs text-slate-300">{t("Herramienta:")} {call.name}</p>)}
      {trace.rag_chunk_ids.length > 0 && <p className="text-xs text-slate-300">{trace.rag_chunk_ids.length} {t("fragmentos RAG usados")}</p>}
      <TraceContext agentId={agentId} traceId={trace.id} />
    </details>
  );
}

export function AgentProfile({ agentId }: { agentId: string }) {
  const client = useQueryClient();
  const tab = useOffice((s) => s.profileTab);
  const live = useOffice((s) => s.agents[agentId]);
  const { openAgent, follow, replay } = useOffice.getState();
  const { data, refetch } = useQuery({ queryKey: ["profile", agentId], queryFn: () => api.get<Profile>(`/agents/${agentId}/profile`) });
  const refresh = () => {
    refetch();
    client.invalidateQueries({ queryKey: ["snapshot"] });
  };
  const act = async (verb: string) => {
    await api.post(`/agents/${agentId}/${verb}`);
    refresh();
  };
  const fire = async () => {
    if (!window.confirm(t("¿Despedir a {0}? Su historial se conserva.", live?.name))) return;
    await api.del(`/agents/${agentId}`);
    openAgent(null);
    refresh();
  };
  const showPath = async () => {
    const moves = await api.get<{ path: Tile[] }[]>(`/agents/${agentId}/path`);
    const last = moves[moves.length - 1];
    if (last) replay(agentId, last.path);
  };
  const status = live ? STATUS[live.status] : null;
  return (
    <aside aria-label={t("Ficha del agente")} className="flex w-[30rem] max-w-[45vw] shrink-0 flex-col border-l border-ink-line bg-ink">
      <header className="space-y-1 p-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{live?.name}</h2>
          <Button aria-label={t("Cerrar ficha")} onClick={() => openAgent(null)}>✕</Button>
        </div>
        {status && <p className="text-sm"><span aria-hidden>{status.icon}</span> {status.label} {live?.pause_reason && `· ${live.pause_reason}`}</p>}
        <div className="flex flex-wrap gap-1">
          {live?.status === "paused" ? <Button onClick={() => act("resume")}>{t("Reanudar")}</Button> : <Button onClick={() => act("pause")}>{t("Pausar")}</Button>}
          <Button onClick={() => act("reset")}>{t("Reiniciar")}</Button>
          <Button onClick={() => follow(agentId)}>{t("Seguir")}</Button>
          <Button onClick={showPath}>{t("Repetir recorrido")}</Button>
          <Button onClick={() => act("clone")}>{t("Clonar")}</Button>
          <Button tone="danger" onClick={fire}>{t("Despedir")}</Button>
        </div>
      </header>
      <Tabs tabs={TABS} active={tab} onChange={(key) => openAgent(agentId, key)} />
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === "chat" && <ChatTab agentId={agentId} />}
        {data && data.agent.id === agentId && tab === "profile" && <ProfileTab key={agentId} data={data} refresh={refresh} />}
        {data && data.agent.id === agentId && tab === "prompt" && (
          <PromptTab key={`${agentId}:${data.profile.prompt.version}`} agentId={agentId} current={data.profile.prompt.system_prompt} version={data.profile.prompt.version} refresh={refresh} />
        )}
        {data && tab === "capabilities" && (
          <div className="space-y-2 text-sm">
            <h3 className="font-semibold">{t("Herramientas")}</h3>
            <ToolPicker
              value={data.capabilities.tools}
              usable={data.capabilities.usable_now}
              roomId={data.agent.home_room_id}
              onChange={async (tools) => {
                await api.patch(`/agents/${agentId}`, { tools });
                refresh();
              }}
            />
            <p>{t("Presupuesto diario:")} {data.cost.budget_eur.toFixed(2)} €</p>
            <h3 className="font-semibold">{t("Supervisión")}</h3>
            {data.capabilities.supervised_by.map((s, index) => <p key={index}>{s.kind}: {useOffice.getState().agents[s.supervisor_id]?.name}</p>)}
          </div>
        )}
        {data && tab === "knowledge" && (
          <ul className="space-y-1 text-sm">
            {data.knowledge.map((item) => (
              <li key={item.base_id} className="flex justify-between rounded bg-ink-soft p-2">
                {item.name} <span><Badge>{item.scope}</Badge> <Badge>{item.can_write ? "lee y escribe" : "lee"}</Badge></span>
              </li>
            ))}
          </ul>
        )}
        {data && tab === "work" && (
          <div className="space-y-3 text-sm">
            <TaskList title={t("Tarea actual")} tasks={data.work.current ? [data.work.current] : []} />
            <TaskList title={t("Cola")} tasks={data.work.queue} />
            <TaskList title={t("Terminadas")} tasks={data.work.finished} />
          </div>
        )}
        {data && tab === "performance" && (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt>{t("Tareas completadas")}</dt><dd>{data.performance.completed}</dd>
            <dt>{t("Fallidas")}</dt><dd>{data.performance.failed}</dd>
            <dt>{t("Aceptadas a la primera")}</dt><dd>{data.performance.accepted_first_pct ?? "—"} %</dd>
            <dt>{t("Tiempo medio")}</dt><dd>{data.performance.avg_seconds ?? "—"} s</dd>
            <dt>{t("Pasos medios")}</dt><dd>{data.performance.avg_steps ?? "—"}</dd>
          </dl>
        )}
        {data && tab === "cost" && (
          <div className="space-y-3 text-sm">
            <p>{t("Hoy:")} {data.cost.today_eur.toFixed(4)} {t("€ de")} {data.cost.budget_eur.toFixed(2)} € · {data.cost.tokens.input + data.cost.tokens.output} {t("tokens")}</p>
            <BarChart title={t("Gasto por día")} rows={data.cost.by_day.map((d) => ({ label: d.day, value: d.cost_eur }))} />
            <BarChart title={t("Gasto por tarea")} rows={data.cost.by_task.map((t) => ({ label: t.task_id.slice(0, 8), value: t.cost_eur }))} />
          </div>
        )}
        {data && tab === "memory" && (
          <ul className="space-y-1 text-sm">
            {data.memory.length === 0 && <Empty>{t("Sin recuerdos")}</Empty>}
            {data.memory.map((entry) => (
              <li key={entry.id} className="space-y-1 rounded bg-ink-soft p-2">
                <textarea
                  aria-label={t("Recuerdo")}
                  className={inputClass}
                  defaultValue={entry.summary}
                  onBlur={(e) => api.patch(`/agents/${agentId}/memories/${entry.id}`, { summary: e.target.value })}
                />
                <Button onClick={async () => { await api.del(`/agents/${agentId}/memories/${entry.id}`); refresh(); }}>{t("Borrar")}</Button>
              </li>
            ))}
          </ul>
        )}
        {data && tab === "audit" && (
          <div className="space-y-2 text-sm">
            <h3 className="font-semibold">{t("Anomalías")}</h3>
            {data.audit.anomalies.length === 0 && <Empty>{t("Ninguna")}</Empty>}
            {data.audit.anomalies.map((item) => <p key={item.id}>🛡 {item.rule} · {item.severity} · {item.status}</p>)}
            <h3 className="font-semibold">{t("Trazas")}</h3>
            {data.audit.traces.map((trace) => <TraceView key={trace.id} agentId={agentId} trace={trace} />)}
          </div>
        )}
      </div>
    </aside>
  );
}
