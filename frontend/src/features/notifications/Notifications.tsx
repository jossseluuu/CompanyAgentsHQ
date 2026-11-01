import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "@/api/client";
import { Button, Empty } from "@/shared/ui";

interface Item {
  id: string;
  title: string;
  link: string;
  read_at: string | null;
}

export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["notifications"], queryFn: () => api.get<Item[]>("/notifications") });
  const unread = data.filter((n) => !n.read_at).length;
  const toggle = async () => {
    setOpen(!open);
    if (!open && unread) {
      await api.post("/notifications/read");
      await client.invalidateQueries({ queryKey: ["notifications"] });
    }
  };
  return (
    <div className="relative">
      <Button onClick={toggle} aria-expanded={open}>Avisos: {unread}</Button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 max-h-80 w-72 overflow-y-auto rounded border border-ink-line bg-ink-soft p-2 text-sm shadow-lg">
          {data.length === 0 && <Empty>Sin avisos</Empty>}
          {data.map((item) => (
            <Link key={item.id} to={item.link.startsWith("/tasks") ? "/" : item.link || "/"} className="block rounded p-1 hover:bg-ink-line" onClick={() => setOpen(false)}>
              {item.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
