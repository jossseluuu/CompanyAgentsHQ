import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { api } from "@/api/client";
import type { Anomaly, Citation, Message, Task, Trace } from "@/api/types";
import { STATUS } from "@/office/status";
import type { Tile } from "@/office/pathAnimator";
import { Badge, BarChart, Button, Empty, ErrorNote, Field, inputClass, statusLabel, Tabs } from "@/shared/ui";
import { useOffice } from "@/store/office";

const TABS = [
  ["profile", "Perfil"],
  ["capabilities", "Capacidades"],
  ["knowledge", "Conocimiento"],
  ["work", "Trabajo"],
  ["performance", "Rendimiento"],
  ["cost", "Coste"],
  ["memory", "Memoria"],
  ["audit", "Auditoría"],
  ["chat", "Chat"],
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

function ProfileTab({ data, refresh }: { data: Profile; refresh: () => void }) {
  const [prompt, setPrompt] = useState(data.profile.prompt.system_prompt);
  const [error, setError] = useState<unknown>(null);
  const agent = data.agent;
  const rooms = useOffice((s) => s.snapshot?.office.rooms ?? []);
  const versions = useQuery({
    queryKey: ["prompt-versions", agent.id],
    queryFn: () => api.get<{ version: number; note: string; system_prompt: string }[]>(`/agents/${agent.id}/prompt-versions`),
  });
  const savePrompt = async (body: object) => {
    try {
      await api.post(`/agents/${agent.id}/prompt-versions`, body);
      await versions.refetch();
      refresh();
    } catch (failure) {
      setError(failure);
    }
  };
  const update = (body: object) => api.patch(`/agents/${agent.id}`, body).then(refresh).catch(setError);
  return (
    <div className="space-y-2 text-sm">
      <p>Rol: {agent.role}</p>
      <Field label="Modelo (fast, powerful o proveedor:modelo)">
        <input className={inputClass} defaultValue={agent.model} onBlur={(e) => update({ model: e.target.value })} />
      </Field>
      <Field label="Temperatura (solo modelos locales)">
        <input type="number" step="0.1" min="0" max="1" className={inputClass} defaultValue={agent.temperature} onBlur={(e) => update({ temperature: Number(e.target.value) })} />
      </Field>
      <Field label="Trasladar a la sala">
        <select className={inputClass} value={agent.home_room_id ?? ""} onChange={(e) => update({ home_room_id: e.target.value })}>
          {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
        </select>
      </Field>
      <Field label={`Prompt de sistema (versión ${data.profile.prompt.version})`}>
        <textarea className={`${inputClass} h-48`} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </Field>
      <ErrorNote error={error} />
      <Button tone="primary" onClick={() => savePrompt({ system_prompt: prompt, note: "Editado desde la ficha" })}>Guardar versión</Button>
      <details>
        <summary>Historial de versiones</summary>
        {versions.data?.map((entry) => (
          <div key={entry.version} className="mt-1 rounded bg-ink-soft p-2">
            <p className="flex items-center justify-between">
              v{entry.version} {entry.note}
              <Button onClick={() => savePrompt({ restore_version: entry.version })}>Restaurar</Button>
            </p>
            <details>
              <summary className="text-xs">Comparar con el actual</summary>
              <PromptDiff before={entry.system_prompt} after={prompt} />
            </details>
          </div>
        ))}
      </details>
    </div>
  );
}

export function promptDiff(before: string, after: string) {
  const old = new Set(before.split("\n"));
  const current = new Set(after.split("\n"));
  return [
    ...before.split("\n").filter((l) => !current.has(l)).map((text) => ({ sign: "−", text })),
    ...after.split("\n").filter((l) => !old.has(l)).map((text) => ({ sign: "+", text })),
  ];
}

function PromptDiff({ before, after }: { before: string; after: string }) {
  const lines = promptDiff(before, after);
  if (!lines.length) return <p className="text-xs">Sin cambios</p>;
  return <pre className="markdown text-xs">{lines.map((l) => `${l.sign} ${l.text}`).join("\n")}</pre>;
}

function ChatTab({ agentId }: { agentId: string }) {
  const client = useQueryClient();
  const stream = useOffice((s) => s.streams[agentId]);
  const { data = [] } = useQuery({ queryKey: ["messages", agentId], queryFn: () => api.get<Message[]>(`/agents/${agentId}/messages`) });
  const [text, setText] = useState("");
  const [error, setError] = useState<unknown>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView?.(), [data, stream]);
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
        {data.length === 0 && <Empty>Escribe al agente</Empty>}
        {data.map((message) => (
          <div key={message.id} className={`rounded p-2 ${message.role === "owner" ? "ml-8 bg-indigo-900" : "mr-8 bg-ink-soft"}`}>
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
          aria-label="Mensaje"
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
        <Button tone="primary" onClick={send}>Enviar</Button>
      </div>
    </div>
  );
}

function TaskList({ title, tasks }: { title: string; tasks: Task[] }) {
  return (
    <section>
      <h3 className="font-semibold">{title}</h3>
      {tasks.length === 0 && <Empty>Nada</Empty>}
      {tasks.map((task) => (
        <p key={task.id} className="flex justify-between gap-2 py-0.5">{task.title} <Badge>{statusLabel(task.status)}</Badge></p>
      ))}
    </section>
  );
}

function TraceView({ trace }: { trace: Trace }) {
  return (
    <details className="rounded bg-ink-soft p-2">
      <summary>{trace.kind} paso {trace.step} · {trace.model} · v{trace.prompt_version} · {trace.input_tokens + trace.output_tokens} tokens · {trace.latency_ms} ms</summary>
      <p className="markdown mt-1 text-xs">{trace.output}</p>
      {trace.tool_calls.map((call, index) => <p key={index} className="text-xs text-slate-300">Herramienta: {call.name}</p>)}
      {trace.rag_chunk_ids.length > 0 && <p className="text-xs text-slate-300">{trace.rag_chunk_ids.length} fragmentos RAG usados</p>}
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
    if (!window.confirm(`¿Despedir a ${live?.name}? Su historial se conserva.`)) return;
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
    <aside aria-label="Ficha del agente" className="flex w-[30rem] max-w-[45vw] shrink-0 flex-col border-l border-ink-line bg-ink">
      <header className="space-y-1 p-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{live?.name}</h2>
          <Button aria-label="Cerrar ficha" onClick={() => openAgent(null)}>✕</Button>
        </div>
        {status && <p className="text-sm"><span aria-hidden>{status.icon}</span> {status.label} {live?.pause_reason && `· ${live.pause_reason}`}</p>}
        <div className="flex flex-wrap gap-1">
          {live?.status === "paused" ? <Button onClick={() => act("resume")}>Reanudar</Button> : <Button onClick={() => act("pause")}>Pausar</Button>}
          <Button onClick={() => act("reset")}>Reiniciar</Button>
          <Button onClick={() => follow(agentId)}>Seguir</Button>
          <Button onClick={showPath}>Repetir recorrido</Button>
          <Button onClick={() => act("clone")}>Clonar</Button>
          <Button tone="danger" onClick={fire}>Despedir</Button>
        </div>
      </header>
      <Tabs tabs={TABS} active={tab} onChange={(key) => openAgent(agentId, key)} />
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === "chat" && <ChatTab agentId={agentId} />}
        {data && tab === "profile" && <ProfileTab key={data.profile.prompt.version} data={data} refresh={refresh} />}
        {data && tab === "capabilities" && (
          <div className="space-y-2 text-sm">
            <h3 className="font-semibold">Herramientas</h3>
            {data.agent.tools.length === 0 && <Empty>Ninguna</Empty>}
            {data.capabilities.tools.map((tool) => (
              <label key={tool} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked
                  onChange={async () => {
                    await api.patch(`/agents/${agentId}`, { tools: data.capabilities.tools.filter((t) => t !== tool) });
                    refresh();
                  }}
                />
                {tool} {!data.capabilities.usable_now.includes(tool) && <Badge>sin módulo en su sala</Badge>}
              </label>
            ))}
            <p>Presupuesto diario: {data.cost.budget_eur.toFixed(2)} €</p>
            <h3 className="font-semibold">Supervisión</h3>
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
            <TaskList title="Tarea actual" tasks={data.work.current ? [data.work.current] : []} />
            <TaskList title="Cola" tasks={data.work.queue} />
            <TaskList title="Terminadas" tasks={data.work.finished} />
          </div>
        )}
        {data && tab === "performance" && (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt>Tareas completadas</dt><dd>{data.performance.completed}</dd>
            <dt>Fallidas</dt><dd>{data.performance.failed}</dd>
            <dt>Aceptadas a la primera</dt><dd>{data.performance.accepted_first_pct ?? "—"} %</dd>
            <dt>Tiempo medio</dt><dd>{data.performance.avg_seconds ?? "—"} s</dd>
            <dt>Pasos medios</dt><dd>{data.performance.avg_steps ?? "—"}</dd>
          </dl>
        )}
        {data && tab === "cost" && (
          <div className="space-y-3 text-sm">
            <p>Hoy: {data.cost.today_eur.toFixed(4)} € de {data.cost.budget_eur.toFixed(2)} € · {data.cost.tokens.input + data.cost.tokens.output} tokens</p>
            <BarChart title="Gasto por día" rows={data.cost.by_day.map((d) => ({ label: d.day, value: d.cost_eur }))} />
            <BarChart title="Gasto por tarea" rows={data.cost.by_task.map((t) => ({ label: t.task_id.slice(0, 8), value: t.cost_eur }))} />
          </div>
        )}
        {data && tab === "memory" && (
          <ul className="space-y-1 text-sm">
            {data.memory.length === 0 && <Empty>Sin recuerdos</Empty>}
            {data.memory.map((entry) => (
              <li key={entry.id} className="space-y-1 rounded bg-ink-soft p-2">
                <textarea
                  aria-label="Recuerdo"
                  className={inputClass}
                  defaultValue={entry.summary}
                  onBlur={(e) => api.patch(`/agents/${agentId}/memories/${entry.id}`, { summary: e.target.value })}
                />
                <Button onClick={async () => { await api.del(`/agents/${agentId}/memories/${entry.id}`); refresh(); }}>Borrar</Button>
              </li>
            ))}
          </ul>
        )}
        {data && tab === "audit" && (
          <div className="space-y-2 text-sm">
            <h3 className="font-semibold">Anomalías</h3>
            {data.audit.anomalies.length === 0 && <Empty>Ninguna</Empty>}
            {data.audit.anomalies.map((item) => <p key={item.id}>🛡 {item.rule} · {item.severity} · {item.status}</p>)}
            <h3 className="font-semibold">Trazas</h3>
            {data.audit.traces.map((trace) => <TraceView key={trace.id} trace={trace} />)}
          </div>
        )}
      </div>
    </aside>
  );
}
