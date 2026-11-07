export type AgentStatus =
  | "idle"
  | "walking"
  | "thinking"
  | "working"
  | "reviewing"
  | "meeting"
  | "resting"
  | "waiting_approval"
  | "flagged"
  | "error"
  | "paused";

export interface Agent {
  personality?: string;
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  pause_reason: string;
  department_id: string | null;
  home_room_id: string | null;
  manager_id: string | null;
  current_room_id: string | null;
  current_task_id: string | null;
  model: string;
  temperature: number;
  tools: string[];
  daily_budget_eur: number;
  pos_x: number;
  pos_y: number;
  seat_x: number;
  seat_y: number;
  resting_since: string | null;
}

export interface RoomModule {
  id: string;
  module_key: string;
  name: string;
  config: Record<string, any>;
}

export interface FurnitureItem {
  id: string;
  room_module_id: string;
  model_key: string;
  grid_x: number;
  grid_y: number;
  rotation: number;
  interactive: boolean;
  width: number;
  depth: number;
  variant: string;
}

export interface FurnitureModel {
  key: string;
  group?: string;
  sizes: number[][];
  variants: string[];
}

export interface ToolInfo {
  name: string;
  description: string;
  input_schema: unknown;
  sensitive: boolean;
  core: boolean;
  group?: string;
  modules: string[];
  module_keys?: string[];
}

export interface PromptPreview {
  version: number;
  layers: { source: string; text: string }[];
  system: string;
  tools: { name: string; description: string; input_schema: unknown }[];
  memory: string;
}

export interface Room {
  restricted?: boolean;
  id: string;
  name: string;
  slug: string;
  grid_x: number;
  grid_y: number;
  width: number;
  height: number;
  color: string;
  doors: number[][];
  modules: RoomModule[];
  furniture: FurnitureItem[];
}

export interface Department {
  id: string;
  name: string;
  color: string;
}

export interface Snapshot {
  sector?: string;
  timezone?: string;
  id: string;
  name: string;
  mission: string;
  values: string;
  status: string;
  daily_budget_eur: number;
  monthly_budget_eur: number;
  departments: Department[];
  office: { width: number; height: number; rooms: Room[] };
  agents: Agent[];
}

export interface StatusBar {
  company: string;
  status: string;
  spend_today_eur: number;
  daily_limit_eur: number;
  simulated: boolean;
  pending_approvals: number;
  open_anomalies: number;
}

export interface Task {
  id: string;
  title: string;
  instructions: string;
  status: string;
  blocked_reason: string;
  priority: number;
  assigned_agent_id: string | null;
  result_file_id: string | null;
  result_text: string;
  review_comment: string;
  error: string;
  rejections: number;
  steps_used: number;
  recurrence?: string;
  depends_on?: string[];
  children?: Task[];
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  status: string;
  plan: { summary: string; tasks: { role: string; title: string; instructions: string }[] } | null;
  tasks?: Task[];
}

export interface FileRow {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  created_by_agent_id: string | null;
  created_by_task_id: string | null;
  version: number;
}

export interface Citation {
  n: number;
  document: string;
  page: number | null;
  fragment: string;
  base: string;
  score: number;
  file_id: string | null;
}

export interface Message {
  id: string;
  role: string;
  content: string;
  citations: Citation[];
}

export interface Approval {
  id: string;
  action_type: string;
  status: string;
  payload: Record<string, any>;
  comment: string;
  task_id: string | null;
  requester_name: string;
  approver_agent_id: string | null;
  created_at: string;
}

export interface AuditEvent {
  seq: number;
  actor: string;
  type: string;
  target: string;
  data: Record<string, unknown>;
  cost_eur: number;
  hash: string;
  created_at: string;
}

export interface Anomaly {
  id: string;
  agent_id: string | null;
  rule: string;
  severity: string;
  status: string;
  created_at: string;
}

export interface Trace {
  id: string;
  step: number;
  kind: string;
  model: string;
  prompt_version: number;
  input_tokens: number;
  output_tokens: number;
  cost_eur: number;
  output: string;
  tool_calls: { name: string; input: unknown }[];
  rag_chunk_ids: string[];
  latency_ms: number;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  scope: string;
  scope_id: string | null;
  documents: number;
}

export interface KbDocument {
  id: string;
  title: string;
  status: string;
  error: string;
  chunks: number;
  embedding_model: string;
}
