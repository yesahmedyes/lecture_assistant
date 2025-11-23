export interface Session {
  session_id: string;
  topic: string;
  status: string;
  created_at: string;
  completed_at?: string;
  model?: string;
  temperature?: number;
  seed?: number;
}

export interface SessionStatus {
  session_id: string;
  status: string;
  current_node?: string;
  waiting_for_human: boolean;
  checkpoint_type?: string;
  checkpoint_data?: CheckpointData;
}

export interface CheckpointData {
  type: string;
  plan_summary?: string;
  queries?: string[];
  claims?: Claim[];
  citation_map?: Record<string, { title: string; url: string }>;
  outline?: string;
  outline_preview?: string;
  options: CheckpointOption[];
}

export interface CheckpointOption {
  id: string;
  label: string;
  requires_input?: boolean;
}

export interface Claim {
  id: number;
  text: string;
  citations: string[];
}

export interface SessionResult {
  session_id: string;
  topic: string;
  status: string;
  final_brief?: string;
  formatted_brief?: string;
  slides?: string;
  outline?: string;
  sources?: Source[];
  claims?: Claim[];
}

export interface Source {
  title: string;
  url: string;
  snippet: string;
  content?: string;
  query?: string;
}

export interface LogEntry {
  timestamp: number;
  node: string;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  prompt?: string;
  model?: Record<string, any>;
}

export interface LogsResponse {
  session_id: string;
  logs: LogEntry[];
  node_trace: string[];
}

export interface StartSessionRequest {
  topic: string;
  model?: string;
  temperature?: number;
  seed?: number;
}

export interface HumanFeedbackRequest {
  decision: string;
  additional_data?: Record<string, any>;
}

export interface NodeVisit {
  id: string; // Unique identifier: timestamp + node name + visit count
  node: string; // Node name (e.g., "input", "search_plan", "plan_review")
  status: "active" | "completed" | "checkpoint"; // Current status
  timestamp: number; // When the node started
  isCheckpoint: boolean; // Whether this is a HITL checkpoint node
  checkpointType?: string; // If checkpoint, the type (plan_review, claims_review, review, tone_review)
}
