import type { Product, SignalType } from "../types";

// Five highlighter families. A colour always travels with its label, never alone.
export type Family = "comp" | "rival" | "cpq" | "plan" | "lead";

export const FAMILY: Record<Family, { label: string; hl: string; ink: string }> = {
  comp: { label: "Comp process", hl: "var(--hl-comp)", ink: "var(--ink-comp)" },
  rival: { label: "Competitor in place", hl: "var(--hl-rival)", ink: "var(--ink-rival)" },
  cpq: { label: "Quoting", hl: "var(--hl-cpq)", ink: "var(--ink-cpq)" },
  plan: { label: "Planning", hl: "var(--hl-plan)", ink: "var(--ink-plan)" },
  lead: { label: "Leadership hire", hl: "var(--hl-lead)", ink: "var(--ink-lead)" },
};

export const SIGNAL: Record<SignalType, { label: string; short: string; family: Family }> = {
  spreadsheet_comp: { label: "Commissions run on spreadsheets", short: "Spreadsheet comp", family: "comp" },
  icm_greenfield: { label: "Building the comp process from scratch", short: "Greenfield comp", family: "comp" },
  comp_redesign: { label: "Redesigning comp plans", short: "Plan redesign", family: "comp" },
  audit_controls: { label: "Audit and controls over commissions", short: "Comp controls", family: "comp" },
  icm_incumbent: { label: "Runs a competing commission tool", short: "Competitor in place", family: "rival" },
  cpq_legacy: { label: "Salesforce CPQ in the stack", short: "Salesforce CPQ", family: "cpq" },
  cpq_pain: { label: "Quoting and approval workload", short: "Deal desk load", family: "cpq" },
  planning_buildout: { label: "Owns territory, quota or capacity models", short: "Planning build", family: "plan" },
  scale_up: { label: "Sales team scaling fast", short: "Scaling", family: "plan" },
  new_revops_leader: { label: "Hiring a RevOps leader", short: "New leader", family: "lead" },
};

export const PRODUCT: Record<Product, string> = { incentives: "Incentive comp", cpq: "CPQ", planning: "Planning" };

export const ROLE: Record<string, string> = {
  commissions_admin: "Commissions admin", sales_comp_strategy: "Sales comp strategy", revops_leader: "RevOps leader",
  revops_ic: "RevOps analyst", deal_desk: "Deal desk", sales_planning: "Sales planning", gtm_systems: "GTM systems",
  finance_accounting: "Finance and accounting", bizops: "Business operations", other: "Other",
};

export const SENIORITY: Record<string, string> = { ic: "Individual contributor", manager: "Manager", director: "Director", vp_plus: "VP and above" };

export const ATS: Record<string, string> = { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby" };

const OWN = { label: "Names your product: likely a customer", short: "Your product in place", family: "comp" as Family };

/** True when a posting names the seller's own product (set in the seller profile). */
export function namesOwnProduct(tools: { name: string }[] | null | undefined, aliases: string[] | undefined): boolean {
  if (!aliases?.length) return false;
  const set = aliases.map((a) => a.toLowerCase());
  return (tools ?? []).some((t) => set.includes(t.name.toLowerCase()));
}

/** Label for a signal. "Competitor in place" becomes "Your product in place" when the tool named is the seller's own. */
export function signalMeta(t: SignalType, own = false) {
  return own && t === "icm_incumbent" ? OWN : SIGNAL[t];
}

export function familyOf(t: SignalType): Family {
  return SIGNAL[t]?.family ?? "comp";
}
