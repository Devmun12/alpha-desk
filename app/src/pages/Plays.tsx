import { useMemo } from "react";
import { PLAYS } from "../../../supabase/functions/_shared/plays.ts";
import { go, useDesk } from "../store";
import { n } from "../lib/format";

export function Plays() {
  const { desk, byId } = useDesk();
  const rows = useMemo(() => PLAYS.map((p) => {
    const plays = desk.plays.filter((x) => x.playKey === p.key);
    const ids = new Set(plays.map((x) => x.id));
    const ev = desk.events.filter((e) => e.playId != null && ids.has(e.playId));
    const count = (t: string) => new Set(ev.filter((e) => e.type === t).map((e) => e.playId)).size;
    const treatment = plays.filter((x) => x.status !== "held_out");
    return {
      p, treatment: treatment.length, control: plays.length - treatment.length,
      approved: count("approved"), sent: count("sent"), replied: count("replied"), meetings: count("meeting"),
      examples: treatment.slice(0, 3).map((x) => byId.get(x.accountId)).filter(Boolean),
    };
  }), [desk, byId]);

  return (
    <div className="page-inner">
      <div className="page-head">
        <h1>Plays</h1>
        <p className="lede">Seven plays, each tied to a signal the pipeline can prove. Every play has an owner, a short list of approved claims the drafting model is limited to, a success metric and a rule for retiring it if it does not move replies or meetings. The claims ship as capability statements; replace them with your own verified proof before sending at volume.</p>
      </div>
      <div style={{ display: "grid", gap: 16 }}>
        {rows.map(({ p, treatment, control, approved, sent, replied, meetings, examples }) => (
          <article className="panel play-card" key={p.key} id={`play-${p.key}`}>
            <div className="actions">
              <h2 style={{ fontSize: 20 }}>{p.name}</h2>
              <span className="pill">{p.product}</span>
              <span className="pill">{p.motion}</span>
              <span className="pill">{p.owner}</span>
              <span className="grow" />
              {treatment > 0 ? <span className="pill ok">Live on {treatment} accounts</span> : <span className="pill">Waiting for a matching signal</span>}
            </div>
            <p className="soft" style={{ maxWidth: "75ch" }}>{p.angle}</p>
            <dl className="kv">
              <dt>Fires when</dt><dd>{p.trigger}</dd>
              <dt>Contact</dt><dd>{p.who}</dd>
              <dt>Ask</dt><dd>{p.cta}</dd>
              <dt>Approved claims</dt><dd>{p.proof.map((x) => <div key={x.text} style={{ marginBottom: 4 }}>{x.text} <span className="muted">({x.source})</span></div>)}</dd>
              <dt>Guardrails</dt><dd>{p.guardrails.join(" ")}</dd>
              <dt>Success</dt><dd>{p.successMetric}</dd>
              <dt>Retire when</dt><dd>{p.killRule}</dd>
            </dl>
            <div className="stats num">
              <span><b>{n(treatment)}</b>drafted</span>
              <span><b>{n(control)}</b>held out</span>
              <span><b>{n(approved)}</b>approved</span>
              <span><b>{n(sent)}</b>sent</span>
              <span><b>{n(replied)}</b>replies</span>
              <span><b>{n(meetings)}</b>meetings</span>
            </div>
            {examples.length > 0 && (
              <div className="actions small">
                <span className="muted">On the desk now:</span>
                {examples.map((a) => a && <button key={a.id} className="btn sm" onClick={() => go(`account-${a.id}`)}>{a.name} ({a.score})</button>)}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
