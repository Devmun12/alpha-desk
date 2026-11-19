// The play catalog: what a rep should do when a signal fires. Plays are deliberately
// few, each with a trigger, an owner, an angle, approved claims and a rule for retiring it.
// Approved claims are the ONLY statements a draft may make about the seller. They are
// written as capabilities, not results; replace them with your own verified proof
// (customer stories, numbers with sources) before sending at volume.

export interface Play {
  key: string;
  name: string;
  product: "Incentive comp" | "CPQ" | "Planning" | "Platform";
  motion: "New business" | "Displacement" | "Expansion";
  owner: "BDR" | "AE" | "AM / CSM";
  trigger: string;
  who: string;
  angle: string;
  cta: string;
  proof: { text: string; source: string }[];
  asset?: { label: string; url: string };
  guardrails: string[];
  successMetric: string;
  killRule: string;
}

const CAPABILITY = "Capability statement: replace with verified proof";

export const PLAYS: Play[] = [
  {
    key: "retire-the-spreadsheet",
    name: "Retire the spreadsheet",
    product: "Incentive comp", motion: "New business", owner: "BDR",
    trigger: "The posting says commissions run in spreadsheets, it is the first comp hire, or comp is under audit pressure.",
    who: "The hiring manager for the role: usually the Head of RevOps, Controller or VP Finance.",
    angle: "They are about to hire a person to run the spreadsheet. Offer to make this the last hire who has to.",
    cta: "Ask for 20 minutes before the new hire starts, to show what their first 90 days look like without the spreadsheet.",
    proof: [
      { text: "Commission plans are set up once and calculated automatically from CRM and billing data, with statements reps can check themselves and an audit trail finance can rely on.", source: CAPABILITY },
      { text: "Plan changes are made by the ops team without spreadsheet rebuilds or vendor tickets.", source: CAPABILITY },
    ],
    guardrails: ["Never claim to know their payee count unless the posting states it.", "Do not mock their current process; the new hire is the reader's colleague."],
    successMetric: "Positive reply within 14 days",
    killRule: "Retire if reply rate stays under 2% after 150 sends, or treatment shows no lift over holdout at day 45.",
  },
  {
    key: "incumbent-swap",
    name: "Incumbent swap",
    product: "Incentive comp", motion: "Displacement", owner: "AE",
    trigger: "The posting names a commission tool already in place (CaptivateIQ, Xactly, Spiff, Varicent, QuotaPath, Performio and others).",
    who: "The hiring manager, or the head of sales compensation.",
    angle: "A new comp hire inherits the tool, and the first quarter is when the admin load shows. Offer a side-by-side on one real plan change.",
    cta: "Invite them to bring one plan they changed last quarter and watch it rebuilt live.",
    proof: [
      { text: "A plan change like a new accelerator or split rule can be modelled, previewed against real payouts and published by the ops team the same day.", source: CAPABILITY },
      { text: "Reps and managers can ask payout questions in plain language and get answers built on the same rules that calculate their pay.", source: CAPABILITY },
    ],
    guardrails: ["Never criticise the incumbent by name.", "Never guess a renewal date."],
    successMetric: "Meeting booked within 30 days",
    killRule: "Retire if fewer than 1 in 40 sends books a meeting after 120 sends.",
  },
  {
    key: "cpq-end-of-sale",
    name: "CPQ end-of-sale",
    product: "CPQ", motion: "Displacement", owner: "AE",
    trigger: "Salesforce CPQ (Steelbrick) is in the stack, being administered or being migrated.",
    who: "Deal desk lead, RevOps leader or the Salesforce platform owner.",
    angle: "Salesforce stopped selling Salesforce CPQ to new customers in 2025. Whatever comes next is a re-implementation, so compare options while scoping.",
    cta: "Offer 20 minutes on the quote-to-commission flow while they scope what replaces Salesforce CPQ.",
    proof: [
      { text: "Salesforce CPQ is end-of-sale: no new licences for new customers, with investment moving to Revenue Cloud Advanced.", source: "Salesforce, 'Navigating the Future of Salesforce CPQ'" },
      { text: "Quoting and commissions share one data model, so the deal terms on a quote flow into commission calculations without manual handoffs.", source: CAPABILITY },
    ],
    guardrails: ["Say end-of-sale, never end-of-life.", "Do not claim migration timelines."],
    successMetric: "Meeting booked within 30 days",
    killRule: "Retire if fewer than 1 in 40 sends books a meeting after 120 sends.",
  },
  {
    key: "deal-desk-load",
    name: "Deal desk load",
    product: "CPQ", motion: "New business", owner: "BDR",
    trigger: "The posting describes manual quoting, approval bottlenecks or discount governance.",
    who: "Head of deal desk or RevOps.",
    angle: "Put approvals and discount guardrails inside the quote, and let reps see what a discount does to their commission before they ask for it.",
    cta: "Offer a 20-minute look at approval rules and guardrails on one of their real deal shapes.",
    proof: [
      { text: "Approval rules and discount guardrails run inside the quote, and reps see the commission impact of a discount before they request it.", source: CAPABILITY },
    ],
    guardrails: ["Do not quote approval-time numbers."],
    successMetric: "Positive reply within 14 days",
    killRule: "Retire if reply rate stays under 2% after 150 sends.",
  },
  {
    key: "capacity-build",
    name: "Capacity build",
    product: "Planning", motion: "New business", owner: "BDR",
    trigger: "The posting owns territory, quota or capacity models, or describes a sales team scaling fast.",
    who: "RevOps or sales strategy leader; sometimes FP&A.",
    angle: "Plan territories, quotas and capacity on the same data that pays the reps, so plan changes do not break payouts.",
    cta: "Offer to walk through next year's territory and quota planning connected to commissions.",
    proof: [
      { text: "Territory, quota and capacity plans live on the same data as commission calculations, so a territory change updates quotas and payouts together.", source: CAPABILITY },
    ],
    guardrails: ["Do not assume their fiscal year."],
    successMetric: "Positive reply within 14 days",
    killRule: "Retire if reply rate stays under 2% after 150 sends.",
  },
  {
    key: "new-leader-90",
    name: "New leader, first 90 days",
    product: "Platform", motion: "New business", owner: "AE",
    trigger: "The company is hiring a Head, Director or VP of RevOps, Sales Ops or Sales Compensation.",
    who: "The hiring manager now (CRO or CFO); the new leader once they start.",
    angle: "New RevOps leaders review the stack in their first 90 days. Be useful before that review starts, not a pitch during it.",
    cta: "Offer a comp-and-quoting stack review checklist for a new leader's first 90 days.",
    proof: [
      { text: "A one-page checklist for reviewing commission, quoting and planning processes in a new leader's first 90 days.", source: "Asset to create: owned by marketing" },
    ],
    guardrails: ["Never name or guess who will be hired."],
    successMetric: "Reply or asset download within 30 days",
    killRule: "Retire if under 3% engage after 100 sends.",
  },
  {
    key: "expand-account",
    name: "Expansion signal",
    product: "Platform", motion: "Expansion", owner: "AM / CSM",
    trigger: "An existing customer posts a CPQ, planning or commissions-admin role.",
    who: "The account owner, with the customer's RevOps lead.",
    angle: "A CPQ or planning hire is a cross-sell conversation. A new comp-admin hire may mean they are adding people for work the platform already automates: check adoption first.",
    cta: "Book a check-in on what the new role will own, before they finalise the job's toolset.",
    proof: [
      { text: "Commission runs are checked automatically for missing quotas, data gaps and plan issues before payday.", source: CAPABILITY },
    ],
    guardrails: ["Internal note first: confirm the account owner before any outreach."],
    successMetric: "Expansion conversation within 30 days",
    killRule: "Retire if account owners mark fewer than 1 in 3 alerts as useful after 20 alerts.",
  },
];

export const PLAY_BY_KEY = Object.fromEntries(PLAYS.map((p) => [p.key, p]));

export const SIGNAL_PLAY: Record<string, string> = {
  spreadsheet_comp: "retire-the-spreadsheet", icm_greenfield: "retire-the-spreadsheet", comp_redesign: "retire-the-spreadsheet",
  audit_controls: "retire-the-spreadsheet", icm_incumbent: "incumbent-swap", cpq_legacy: "cpq-end-of-sale",
  cpq_pain: "deal-desk-load", planning_buildout: "capacity-build", scale_up: "capacity-build", new_revops_leader: "new-leader-90",
};

/** Pick the play for an account from its scored signal breakdown. */
export function choosePlay(crmStatus: string, breakdown: Record<string, number>): string {
  if (crmStatus === "customer") return "expand-account";
  const ranked = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  // A named competitor or Salesforce CPQ changes the conversation more than any other signal.
  if (breakdown.cpq_legacy && breakdown.cpq_legacy >= (ranked[0]?.[1] ?? 0) - 6) return "cpq-end-of-sale";
  if (breakdown.icm_incumbent && breakdown.icm_incumbent >= (ranked[0]?.[1] ?? 0) - 6) return "incumbent-swap";
  return SIGNAL_PLAY[ranked[0]?.[0] ?? ""] ?? "new-leader-90";
}
