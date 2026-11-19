// Stage 1 of the funnel: cheap, deterministic rules that decide which postings are
// worth an LLM call. Tuned for recall; the model does the precision work.
// Every rule that fires is stored on the posting so a reviewer can see why it was read.

export interface PrefilterResult {
  tags: string[];
  candidate: boolean;
  salesRole: boolean;
}

const TITLE_RULES: [string, RegExp][] = [
  ["title:comp", /\b(commissions?|incentive comp(ensation)?|sales comp(ensation)?|variable comp(ensation)?|spiffs?)\b/i],
  ["title:revops", /\b(revenue operations|rev ?ops|sales operations|sales ops|gtm operations|go[- ]to[- ]market operations|revenue strategy|sales strategy|gtm strategy|go[- ]to[- ]market strategy)\b/i],
  ["title:dealdesk", /\b(deal desk|deal strategy|deal operations|quote[- ]to[- ]cash|q2c|cpq|pricing (analyst|operations|manager|strategy|lead)|order management)\b/i],
  ["title:planning", /\b(sales planning|territory (planning|design|strategy)|quota (planning|setting|design)|gtm planning|go[- ]to[- ]market planning|sales capacity|(sales|gtm|revenue) capacity planning)\b/i],
  ["title:systems", /\b(gtm systems|go[- ]to[- ]market systems|revenue systems|sales systems|salesforce (admin|administrator|developer|architect|platform)|crm (admin|administrator|manager|systems))\b/i],
  ["title:bizops", /\b(business operations|bizops)\b/i],
];

// Titles that only count if the body talks about sales comp / quoting.
const CONDITIONAL_TITLES: [string, RegExp][] = [
  ["title:finance", /\b(accountant|accounting|payroll|fp&a|financial analyst|finance (manager|analyst|lead))\b/i],
  ["title:hrcomp", /\b(compensation (analyst|manager|partner|lead|specialist)|total rewards)\b/i],
];

const BODY_RULES: [string, RegExp][] = [
  // Operational comp language only. Pay-transparency boilerplate ("eligible for commission",
  // "variable pay") appears on most sales postings and is deliberately not matched.
  ["body:comp", /\b(commission (calculations?|statements?|disputes?|accruals?|processing|operations|administration|payouts?|reconciliations?|audits?)|incentive comp(ensation)? (management|administration|operations|programs?|plans? design)|sales comp(ensation)? (plans? design|programs?|operations|administration|strategy|analytics))\b/i],
  ["body:comp", /\b(calculat|administ|process|reconcil|audit|design|model|pay(ing)? out|accru)\w*\b[^.\n]{0,60}\b(commissions|incentive comp(ensation)?|sales comp(ensation)?)\b/i],
  ["body:icm_vendor", /\b(captivate ?iq|xactly|varicent|quotapath|performio|forma\.ai|qobra|sales ?cookie|commissionly|iconixx|callidus|salesforce spiff)\b/i],
  ["body:icm_vendor", /\bSpiff\b/], // the vendor; all-caps "SPIFF" is the generic sales-contest term
  ["body:cpq_vendor", /\b(salesforce cpq|steelbrick|sbqq|revenue cloud|dealhub|conga|apttus|pandadoc|subskribe|zuora cpq|oracle cpq|nue\.io)\b/i],
  ["body:planning_vendor", /\b(anaplan|fullcast|pigment|adaptive (insights|planning)|varicent planning|xactly (plan|sales planning))\b/i],
  ["body:spreadsheet", /\b(excel|google sheets|spreadsheets?|vlookup|xlookup|pivot tables?)\b/i],
];

const SALES_ROLE = /\b(account executive|sales executive|territory (executive|manager|sales|account)|sales development|business development rep(resentative)?|bdr|sdr|account manager|sales manager|regional (sales|vice president)|enterprise sales|commercial sales|sales engineer|solutions? (engineer|consultant|architect)|sales director|director of sales|vp,? sales|vice president,? sales|head of sales|partner(ship)? manager|channel (sales|manager))\b/i;
const NOT_SALES = /\b(engineer(ing)? manager|software engineer|recruit(er|ing)|marketing manager)\b/i;

const GTM_DEPT = /\b(sales|revenue|finance|operations|g&a|business|gtm|go[- ]to[- ]market|commercial|accounting)\b/i;

/** Title-only screen: decides whether the body is worth downloading / scanning at all. */
export function titleScreen(title: string, department: string | null) {
  const salesRole = SALES_ROLE.test(title) && !NOT_SALES.test(title);
  // Screen v2: a quota-carrying seller is never a buyer signal on its own, whatever else the title says.
  const titleTags = salesRole ? [] : TITLE_RULES.filter(([, re]) => re.test(title)).map(([t]) => t);
  const conditional = !salesRole && CONDITIONAL_TITLES.some(([, re]) => re.test(title));
  const gtm = GTM_DEPT.test(`${department ?? ""} ${title}`);
  return { titleTags, needsBody: titleTags.length > 0 || conditional || (gtm && !salesRole), salesRole };
}

export function prefilter(title: string, department: string | null, text: string, accountName = ""): PrefilterResult {
  const screen = titleScreen(title, department);
  if (!screen.needsBody) return { tags: [], candidate: false, salesRole: screen.salesRole };
  const tags: string[] = [...screen.titleTags];

  // A vendor's own postings mention its product everywhere; ignore self-mentions.
  const self = accountName.trim() ? new RegExp(`\\b${accountName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi") : null;
  const body = (self ? text.replace(self, " ") : text).slice(0, 12_000);
  const bodyTags = [...new Set(BODY_RULES.filter(([, re]) => re.test(body)).map(([t]) => t))];

  for (const [tag, re] of CONDITIONAL_TITLES) {
    if (re.test(title) && (bodyTags.includes("body:comp") || bodyTags.includes("body:icm_vendor"))) tags.push(tag);
  }

  // Strong body evidence on a GTM-adjacent, non-quota-carrying posting is enough on its own.
  const strongBody = bodyTags.some((t) => t === "body:icm_vendor" || t === "body:cpq_vendor" || t === "body:comp");
  if (tags.length === 0 && strongBody && !screen.salesRole && GTM_DEPT.test(`${department ?? ""} ${title}`)) tags.push("body-only");

  const candidate = tags.length > 0;
  if (candidate) tags.push(...bodyTags);
  return { tags: [...new Set(tags)], candidate, salesRole: screen.salesRole };
}
