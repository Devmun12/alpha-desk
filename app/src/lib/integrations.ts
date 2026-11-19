// Payloads for the systems reps already live in. The demo shows them; a deployment with
// SLACK_WEBHOOK_URL / HUBSPOT_TOKEN set would send them from the api function.
import type { Account, PlayRow, Signal } from "../types";
import { PLAY_BY_KEY } from "../../../supabase/functions/_shared/plays.ts";
import { SIGNAL } from "../data/taxonomy";

export function slackAlert(a: Account, s: Signal[], p: PlayRow | undefined, appUrl: string) {
  const play = p ? PLAY_BY_KEY[p.playKey] : undefined;
  const top = s[0];
  const quote = top?.evidence[0]?.quote;
  return {
    text: `${a.name} scored ${a.score}: ${play?.name ?? "new signal"}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `${a.name}: ${a.score}/100` } },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${play?.name ?? "Signal"}* for ${play?.owner ?? "the account owner"}\n${top ? `Hiring: <${top.url ?? appUrl}|${top.title}>` : ""}${quote ? `\n> ${quote}` : ""}`,
        },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: Object.keys(a.breakdown).map((t) => SIGNAL[t as keyof typeof SIGNAL]?.short ?? t).join("  |  ") }],
      },
      {
        type: "actions",
        elements: [
          { type: "button", text: { type: "plain_text", text: "Open in Alpha Desk" }, url: `${appUrl}#account-${a.id}`, style: "primary" },
          { type: "button", text: { type: "plain_text", text: "Not a fit" }, action_id: "dismiss", value: String(p?.id ?? "") },
        ],
      },
    ],
  };
}

export function hubspotPayload(a: Account, p: PlayRow, subject: string, body: string) {
  const play = PLAY_BY_KEY[p.playKey];
  return {
    company: {
      method: "PATCH", path: `/crm/v3/objects/companies/{companyId matched on domain=${a.domain}}`,
      properties: {
        ad_signal_score: a.score, ad_signal_tier: a.tier, ad_play: play?.name, ad_top_signal: SIGNAL[a.topSignal]?.label,
        ad_last_signal_at: a.freshest, ad_experiment_arm: a.holdout ? "control" : "treatment",
      },
    },
    task: {
      method: "POST", path: "/crm/v3/objects/tasks",
      properties: {
        hs_task_subject: `${play?.name}: ${a.name}`, hs_task_type: "EMAIL", hs_task_priority: a.tier === "A" ? "HIGH" : "MEDIUM",
        hs_task_body: `${subject}\n\n${body}`, hs_timestamp: new Date().toISOString(),
      },
      associations: ["company"],
    },
  };
}
