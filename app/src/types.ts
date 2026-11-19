// Shape of GET /api/desk (see supabase/migrations/0006_desk_api.sql).

export type SignalType =
  | "spreadsheet_comp" | "icm_greenfield" | "icm_incumbent" | "comp_redesign" | "cpq_legacy"
  | "cpq_pain" | "planning_buildout" | "new_revops_leader" | "scale_up" | "audit_controls";

export type Product = "incentives" | "cpq" | "planning";

export interface DeskStats {
  boards: number;
  boardsFresh: number;
  companies: number;
  postings: number;
  salesRoles: number;
  candidates: number;
  read: number;
  relevant: number;
  droppedQuotes: number;
  keptQuotes: number;
  extractTokensIn: number;
  extractTokensOut: number;
  draftTokensIn: number;
  draftTokensOut: number;
  extractLatencyP50: number | null;
  firstIngest: string | null;
  lastIngest: string | null;
  lastExtract: string | null;
  lastDraft: string | null;
}

export interface Account {
  id: number;
  name: string;
  domain: string;
  category: string | null;
  crmStatus: "prospect" | "customer" | "open_opp";
  ats: "greenhouse" | "lever" | "ashby" | null;
  openRoles: number;
  salesRoles: number;
  relevantPosts: number;
  freshest: string | null;
  products: Product[] | null;
  intent: number;
  fit: number;
  timing: number;
  score: number;
  tier: "A" | "B" | "C";
  breakdown: Partial<Record<SignalType, number>>;
  topSignal: SignalType;
  holdout: boolean;
}

export interface Tool { name: string; category: string; context: string }
export interface Evidence { quote: string; supports: SignalType }

export interface Signal {
  id: number;
  postId: number;
  accountId: number;
  title: string;
  department: string | null;
  location: string | null;
  url: string | null;
  postedAt: string | null;
  roleFamily: string;
  seniority: string;
  types: SignalType[];
  products: Product[];
  tools: Tool[];
  evidence: Evidence[];
  facts: Record<string, string | null>;
  summary: string;
  confidence: number;
  model: string;
  promptVersion: string;
  droppedQuotes: number;
  content: string | null;
}

export interface Rejected { id: number; accountId: number; title: string; summary: string; company: string; url: string | null }

export interface DraftChecks { passed: boolean; issues: string[]; words: number }

export type PlayStatus = "draft" | "approved" | "sent" | "dismissed" | "held_out";

export interface PlayRow {
  id: number;
  accountId: number;
  playKey: string;
  status: PlayStatus;
  holdout: boolean;
  persona: string | null;
  whyNow: string | null;
  subject: string | null;
  email: string | null;
  linkedin: string | null;
  callOpener: string | null;
  quoteUsed: string | null;
  checks: DraftChecks | Record<string, never>;
  model: string | null;
  promptVersion: string;
  createdAt: string;
  updatedAt: string;
  signalIds: number[];
}

export type EventType =
  | "surfaced" | "viewed" | "approved" | "edited" | "sent" | "dismissed"
  | "signal_up" | "signal_down" | "replied" | "meeting" | "opportunity";

export interface DeskEvent {
  id: number;
  accountId: number | null;
  playId: number | null;
  signalId: number | null;
  type: EventType;
  payload: Record<string, unknown>;
  actor: string;
  at: string;
}

export interface Run {
  id: number;
  kind: "ingest" | "extract" | "draft" | "notify" | "analyze" | "brief";
  status: "running" | "ok" | "partial" | "error";
  startedAt: string;
  finishedAt: string | null;
  stats: Record<string, unknown>;
  error: string | null;
}

export interface Desk {
  generatedAt: string;
  stats: DeskStats;
  accounts: Account[];
  signals: Signal[];
  rejected: Rejected[];
  plays: PlayRow[];
  events: DeskEvent[];
  runs: Run[];
  coverage: { ats: string; boards: number; postings: number }[];
  weights: { signal_type: SignalType; points: number; label: string; play_key: string; description: string }[];
  roleWeights: { role_family: string; multiplier: number; label: string }[];
  /** Agent layer (migration 0012). Optional so older snapshots still load. */
  seller?: { name: string; productAliases: string[] } | null;
  crmSource?: Record<string, string>;
  reviews?: Record<string, Review>;
  brief?: Brief | null;
}

export interface PanelVerdict { buyer: string; score: number; would_reply: boolean; objection: string }
export interface ReviewRound { round: number; version: 0 | 1; verdicts: PanelVerdict[]; mean: number; note: string; model: string }
export interface Review {
  rounds: ReviewRound[];
  shipped: 0 | 1;
  decision: "passed_first_time" | "rewrite_scored_higher" | "rewrite_scored_no_better" | "rewrite_failed_checks" | "rewrite_fixed_checks" | "no_rewrite_offered" | "out_of_time";
  mean: number;
  firstMean: number;
  wouldReply: number;
  of: number;
  other?: { version: 0 | 1; subject: string; email: string; mean: number | null };
}

export interface BriefItem {
  rank: number; accountId: number; name: string; score: number; tier: string; customer: boolean;
  action: "review_draft" | "send_approved" | "follow_up" | "confirm_owner"; actionLabel: string;
  play: string; why: string; quote: string | null; postTitle: string | null; daysSincePost: number | null; panel: string | null; rulePosition: number;
}
export interface Brief {
  date: string; createdAt: string; headline: string; source: "agent" | "rules"; model: string | null; note: string | null;
  items: BriefItem[];
  counts: { ready: number; toSend: number; awaitingReply: number; customers: number; freshThisWeek: number; considered: number };
}

export type Source = "live" | "snapshot";
