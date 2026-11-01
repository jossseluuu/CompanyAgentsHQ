import { useOffice } from "@/store/office";

export interface ServerEvent {
  type: string;
  data: any;
  ts: string;
  seq: number;
}

type Listener = (event: ServerEvent) => void;

const RETRY_MS = [500, 1000, 2000, 5000];

/** WebSocket con reconexión: pide al servidor lo perdido desde el último seq (RNF-TRE-03). */
export class EventSocket {
  private socket: WebSocket | null = null;
  private lastSeq: number | null = null;
  private attempts = 0;
  private closed = false;

  constructor(private listener: Listener) {}

  connect() {
    this.closed = false;
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const since = this.lastSeq === null ? "" : `?since=${this.lastSeq}`;
    const socket = new WebSocket(`${scheme}://${location.host}/ws${since}`);
    this.socket = socket;
    socket.onopen = () => {
      this.attempts = 0;
      useOffice.getState().setConnected(true);
    };
    socket.onmessage = (message) => {
      const event: ServerEvent = JSON.parse(message.data);
      if (event.seq) this.lastSeq = Math.max(this.lastSeq ?? 0, event.seq);
      this.listener(event);
    };
    socket.onclose = () => {
      useOffice.getState().setConnected(false);
      if (this.closed) return;
      const wait = RETRY_MS[Math.min(this.attempts, RETRY_MS.length - 1)];
      this.attempts += 1;
      setTimeout(() => this.connect(), wait);
    };
  }

  close() {
    this.closed = true;
    this.socket?.close();
  }
}
