// Stage 2: the model reads one posting and returns structured, evidence-backed signals.
// Everything the model claims is checked against the posting before it is stored.
import { generateJson, type LlmResult } from "./llm.ts";

// v2: vendor-neutral prompt (Nov 19). v1 named a specific vendor; outputs are otherwise comparable.
export const EXTRACT_VERSION = "extract.v2";

export const SIGNAL_TYPES = [
  "spreadsheet_comp", "icm_greenfield", "icm_incumbent", "comp_redesign",
  "cpq_legacy", "cpq_pain", "planning_buildout", "new_revops_leader", "scale_up", "audit_controls",
] as const;
export type SignalType = typeof SIGNAL_TYPES[number];

export const ROLE_FAMILIES = [
  "commissions_admin", "sales_comp_strategy", "revops_leader", "revops_ic", "deal_desk",
  "sales_planning", "gtm_systems", "finance_accounting", "bizops", "other",
] as const;

export interface Extraction {
  relevant: boolean;
  role_family: typeof ROLE_FAMILIES[number];
  seniority: "ic" | "manager" | "director" | "vp_plus";
  signal_types: SignalType[];
  products: ("incentives" | "cpq" | "planning")[];
  current_tools: { name: string; category: string; context: string }[];
  evidence: { quote: string; supports: SignalType }[];
  facts: {
    reports_to?: string | null; team?: string | null; payee_count?: string | null;
    sales_team_scale?: string | null; crm?: string | null; location?: string | null;
  };
  summary: string;
  confidence: number;
}

const SYSTEM = `You are a revenue-intelligence analyst for a team that sells three connected kinds of software to B2B companies:
- Incentive compensation: sales commission plans, payout calculation, statements, disputes, accruals and audit trail.
- CPQ: configure-price-quote, deal desk approvals and discount guardrails. Salesforce stopped selling Salesforce CPQ to new customers in 2025, so companies running it face a re-platforming decision.
- Sales planning: territory, quota and capacity planning.
Buyers: RevOps, Sales Ops, Sales Compensation, Deal Desk and Finance (commission accounting) leaders.

You read ONE public job posting and report what it reveals about the company's need for this kind of software. A job posting is the company describing, in its own words, work it does today and the tools it runs.

Rules:
1. Use only what the posting says. Never infer a tool, number or fact that is not written.
2. Evidence quotes are copied character-for-character from the posting: 6 to 30 words, no ellipses, no paraphrase, no added words. Prefer the sentence that would make a seller say "that is our problem to solve".
3. Pay-transparency, OTE, benefits and EEO text is never evidence.
4. relevant = true only when the posting shows the company runs sales compensation, quoting / deal desk, or territory / quota / capacity planning in a way this software addresses, OR it is hiring a leader who would own buying it. A quota-carrying sales role (AE, SDR, SE) is not relevant on its own.
5. Signal types (use only those the evidence supports):
   spreadsheet_comp: commissions or comp plans are run in Excel / Google Sheets / manual processes.
   icm_greenfield: building or formalising the comp function or process for the first time, no commission tool named.
   icm_incumbent: a named commission / incentive-compensation tool is in use (for example CaptivateIQ, Xactly, Spiff, Varicent, QuotaPath, Performio).
   comp_redesign: designing or rolling out new comp plans, plan changes, next fiscal year plans.
   cpq_legacy: Salesforce CPQ / Steelbrick or another legacy quoting tool is in use, being migrated or being administered.
   cpq_pain: manual quoting, approval bottlenecks, discount governance or contract desk workload.
   planning_buildout: owning territory design, quota setting or capacity models.
   new_revops_leader: the role is a head / director / VP of RevOps, Sales Ops, Sales Comp or GTM operations.
   scale_up: explicit statements of rapid sales-team growth, new segments or new regions.
   audit_controls: SOX, ASC 606 / ASC 340-40 commission capitalisation, audit or controls over comp.
6. current_tools lists only tools named in the posting. context: in_use (they run it), required_skill (candidate must know it: suggests their stack), migrating_from, migrating_to, unclear.
7. products: which of the three software categories (incentives, cpq, planning) the posting points to.
8. summary: one sentence a seller can read in five seconds, at most 30 words, stating what this hire reveals about the company. Do not name any vendor that is not in the posting. No hype.
9. confidence: 0 to 1, how sure you are that a seller should act on this posting.
If the posting is not relevant, return relevant=false, empty signal_types, products and evidence, and a summary saying why.`;

const S = (description: string) => ({ type: "STRING", description });
const schema = {
  type: "OBJECT",
  properties: {
    relevant: { type: "BOOLEAN" },
    role_family: { type: "STRING", enum: [...ROLE_FAMILIES] },
    seniority: { type: "STRING", enum: ["ic", "manager", "director", "vp_plus"] },
    signal_types: { type: "ARRAY", items: { type: "STRING", enum: [...SIGNAL_TYPES] } },
    products: { type: "ARRAY", items: { type: "STRING", enum: ["incentives", "cpq", "planning"] } },
    current_tools: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: S("Tool name as written"),
          category: { type: "STRING", enum: ["icm", "cpq", "planning", "crm", "billing", "erp", "bi", "spreadsheet", "other"] },
          context: { type: "STRING", enum: ["in_use", "required_skill", "migrating_from", "migrating_to", "unclear"] },
        },
        required: ["name", "category", "context"],
      },
    },
    evidence: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { quote: S("Verbatim span from the posting"), supports: { type: "STRING", enum: [...SIGNAL_TYPES] } },
        required: ["quote", "supports"],
      },
    },
    facts: {
      type: "OBJECT",
      properties: {
        reports_to: { type: "STRING", nullable: true },
        team: { type: "STRING", nullable: true },
        payee_count: { type: "STRING", nullable: true, description: "Number of reps / payees if stated" },
        sales_team_scale: { type: "STRING", nullable: true },
        crm: { type: "STRING", nullable: true },
        location: { type: "STRING", nullable: true },
      },
    },
    summary: S("At most 30 words"),
    confidence: { type: "NUMBER" },
  },
  required: ["relevant", "role_family", "seniority", "signal_types", "products", "current_tools", "evidence", "facts", "summary", "confidence"],
};

// ---- verification -----------------------------------------------------------------

function norm(s: string): string {
  return s.toLowerCase()
    .replace(/[‘’‛`´]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—−]/g, "-").replace(/[•·▪●]/g, " ")
    .replace(/\s+/g, " ").trim();
}

/** A quote survives only if it appears in the posting (whitespace / punctuation-insensitive). */
export function verifyQuote(quote: string, text: string): string | null {
  const q = norm(quote).replace(/^["'\s]+|["'\s.]+$/g, "");
  if (q.split(" ").length < 4) return null;
  const t = norm(text);
  if (t.includes(q)) return quote.trim().replace(/^["']|["']$/g, "");
  // tolerate punctuation drift (commas, colons) but not word changes
  const strip = (s: string) => s.replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
  return strip(t).includes(strip(q)) ? quote.trim() : null;
}

const CANON: [RegExp, string, string][] = [
  [/captivate ?iq/i, "CaptivateIQ", "icm"], [/xactly/i, "Xactly", "icm"], [/varicent/i, "Varicent", "icm"],
  [/spiff/i, "Salesforce Spiff", "icm"], [/quotapath/i, "QuotaPath", "icm"], [/performio/i, "Performio", "icm"],
  [/salesforce cpq|steelbrick|sbqq/i, "Salesforce CPQ", "cpq"],
  [/revenue cloud/i, "Salesforce Revenue Cloud", "cpq"], [/dealhub/i, "DealHub", "cpq"], [/conga|apttus/i, "Conga", "cpq"],
  [/anaplan/i, "Anaplan", "planning"], [/fullcast/i, "Fullcast", "planning"], [/hubspot/i, "HubSpot", "crm"],
  [/^salesforce$|salesforce\.com|sfdc/i, "Salesforce", "crm"], [/netsuite/i, "NetSuite", "erp"], [/zuora/i, "Zuora", "billing"],
  [/excel/i, "Excel", "spreadsheet"], [/google sheets/i, "Google Sheets", "spreadsheet"], [/tableau/i, "Tableau", "bi"],
  [/looker/i, "Looker", "bi"], [/snowflake/i, "Snowflake", "bi"], [/^clari\b/i, "Clari", "other"], [/gong/i, "Gong", "other"],
];

function canonTool(t: { name: string; category: string; context: string }) {
  for (const [re, name, category] of CANON) if (re.test(t.name)) return { ...t, name, category };
  return t;
}

export interface VerifiedExtraction extends Extraction {
  dropped_quotes: number;
}

// Some labels need the quote itself to say the thing (a quote about "variable comp" is not
// proof that comp runs on spreadsheets). Quotes that fail their label's guard are dropped.
const LABEL_GUARDS: Partial<Record<SignalType, RegExp>> = {
  spreadsheet_comp: /excel|sheets|spreadsheet|manual|by hand|workbook/i,
  cpq_legacy: /cpq|steelbrick|revenue cloud|quot|conga|apttus|dealhub/i,
  icm_incumbent: /captivate|xactly|varicent|spiff|quotapath|performio|commission (tool|system|platform|software)/i,
  audit_controls: /sox|asc|audit|control|606|340|compliance/i,
};

export function verify(x: Extraction, text: string): VerifiedExtraction {
  const evidence: Extraction["evidence"] = [];
  let dropped = 0;
  for (const e of x.evidence ?? []) {
    const ok = verifyQuote(e.quote, text);
    const guard = LABEL_GUARDS[e.supports];
    if (!ok || (guard && !guard.test(ok))) { dropped++; continue; }
    if (evidence.length < 4 && !evidence.some((v) => norm(v.quote) === norm(ok))) evidence.push({ quote: ok, supports: e.supports });
  }
  // a tool only counts if its name appears in the posting
  const tl = text.toLowerCase();
  const tools = (x.current_tools ?? [])
    .filter((t) => t.name && tl.includes(t.name.toLowerCase().split(/[ (]/)[0]))
    .map(canonTool)
    .filter((t, i, arr) => arr.findIndex((o) => o.name === t.name) === i)
    .slice(0, 10);
  // a signal type needs at least one verified quote or a matching tool
  const supported = new Set(evidence.map((e) => e.supports));
  if (tools.some((t) => t.category === "icm" && t.context !== "migrating_to")) supported.add("icm_incumbent");
  if (tools.some((t) => t.name === "Salesforce CPQ")) supported.add("cpq_legacy");
  if ((x.seniority === "director" || x.seniority === "vp_plus") && x.role_family === "revops_leader") supported.add("new_revops_leader");
  const signal_types = (x.signal_types ?? []).filter((s) => supported.has(s));
  const relevant = !!x.relevant && signal_types.length > 0;
  return {
    ...x,
    relevant,
    signal_types: relevant ? signal_types : [],
    products: relevant ? [...new Set(x.products ?? [])] : [],
    current_tools: tools,
    evidence: relevant ? evidence : [],
    summary: (x.summary ?? "").slice(0, 280),
    confidence: Math.max(0, Math.min(1, Number(x.confidence) || 0)),
    dropped_quotes: dropped,
  };
}

export async function extractPosting(p: { company: string; title: string; department?: string | null; location?: string | null; text: string }):
  Promise<LlmResult<VerifiedExtraction>> {
  const body = p.text.length > 14_000 ? p.text.slice(0, 14_000) + "\n[truncated]" : p.text;
  const user = `Company: ${p.company}\nJob title: ${p.title}\nDepartment: ${p.department ?? "n/a"}\nLocation: ${p.location ?? "n/a"}\n\n--- POSTING ---\n${body}\n--- END ---`;
  const r = await generateJson<Extraction>({ system: SYSTEM, user, schema, temperature: 0.1, maxOutputTokens: 1800, prefer: "fast" });
  return { ...r, data: verify(r.data, p.text) };
}
