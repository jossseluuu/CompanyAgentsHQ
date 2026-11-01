import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { api, fileUrl } from "@/api/client";
import type { ModuleProps } from "@/modules/registry";
import { Badge, Button, ErrorNote, Field, inputClass } from "@/shared/ui";
import { useOffice } from "@/store/office";
import { t } from "@/shared/i18n";

interface Meeting {
  id: string;
  topic: string;
  status: string;
  minutes_file_id: string | null;
}

export function MeetingTable(_: ModuleProps) {
  const client = useQueryClient();
  const agents = useOffice((s) => s.agents);
  const { data = [] } = useQuery({ queryKey: ["meetings"], refetchInterval: 4000, queryFn: () => api.get<Meeting[]>("/meetings") });
  const [topic, setTopic] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api.post("/meetings", { topic, participants, max_rounds: 2 });
      setTopic("");
      await client.invalidateQueries({ queryKey: ["meetings"] });
    } catch (failure) {
      setError(failure);
    }
  };
  return (
    <div className="space-y-3 text-sm">
      <form onSubmit={submit} className="space-y-1">
        <Field label={t("Tema")}><input required className={inputClass} value={topic} onChange={(e) => setTopic(e.target.value)} /></Field>
        <div className="flex flex-wrap gap-2">
          {Object.values(agents).map((agent) => (
            <label key={agent.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={participants.includes(agent.id)}
                onChange={(e) => setParticipants(e.target.checked ? [...participants, agent.id] : participants.filter((p) => p !== agent.id))}
              />
              {agent.name}
            </label>
          ))}
        </div>
        <ErrorNote error={error} />
        <Button type="submit" tone="primary" disabled={participants.length < 2}>{t("Convocar")}</Button>
      </form>
      <ul>
        {data.map((meeting) => (
          <li key={meeting.id} className="flex items-center gap-2 border-t border-ink-line py-1">
            <span className="flex-1">{meeting.topic}</span>
            <Badge>{meeting.status}</Badge>
            {meeting.minutes_file_id && <a className="underline" href={fileUrl(meeting.minutes_file_id, true)} target="_blank" rel="noreferrer">{t("Acta")}</a>}
          </li>
        ))}
      </ul>
    </div>
  );
}
