import { go, useDesk } from "../store";
import { date, dateTime } from "../lib/format";
import { Empty, Stat } from "../components/ui";
import { Mark } from "../components/icons";

const ACTION_PILL: Record<string, string> = { review_draft: "", send_approved: "ok", follow_up: "warn", confirm_owner: "customer" };

/**
 * The rep's day, sorted before they log in. Rules pick the candidates and a starting order;
 * the model re-ranks and explains; code checks it. Quotes are the company's own words.
 */
export function BriefPage() {
  const { desk } = useDesk();
  const b = desk.brief;
  if (!b || !b.items?.length) {
    return (
      <div className="page-inner">
        <Empty title="No brief yet"><p className="soft">The brief is written each morning once drafts exist. Open the desk to see every scored account.</p><button className="btn primary" onClick={() => go("desk")}>Open the desk</button></Empty>
      </div>
    );
  }
  const moved = b.items.filter((i) => i.rulePosition !== i.rank).length;
  return (
    <div className="page-inner" style={{ maxWidth: 940 }}>
      <div className="page-head">
        <div className="small muted">Today's brief, {date(b.date)}</div>
        <h1 className="display brief-headline">{b.headline}</h1>
        <p className="lede">Five accounts to work first, in order. Each line is the company's own words from a job posting it has open right now.</p>
      </div>

      <div className="stat-line">
        <Stat v={b.counts.ready} k="drafts waiting for review" />
        <Stat v={b.counts.customers} k="existing customers hiring in this area" />
        <Stat v={b.counts.freshThisWeek} k="with a posting from the last 7 days" />
        <Stat v={b.counts.toSend + b.counts.awaitingReply} k="approved or awaiting a reply" />
      </div>

      <ol className="brief-list">
        {b.items.map((i) => (
          <li key={i.accountId}>
            <button className="brief-item" onClick={() => go(`account-${i.accountId}`)}>
              <span className="rank num">{i.rank}</span>
              <span className="body">
                <span className="top">
                  <b className="name">{i.name}</b>
                  <span className={`pill ${ACTION_PILL[i.action] ?? ""}`}>{i.actionLabel}</span>
                  <span className="score num">{i.score}</span>
                </span>
                <span className="why">{i.why}</span>
                {i.quote && <span className="quote"><mark className="hl">{i.quote}</mark></span>}
                <span className="meta">
                  <span>{i.play}</span>
                  {i.postTitle && <span>{i.postTitle}</span>}
                  {i.daysSincePost != null && <span>{i.daysSincePost <= 1 ? "posted in the last day" : `posted ${i.daysSincePost} days ago`}</span>}
                  {i.panel && <span>Panel: {i.panel}</span>}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="section grid-2">
        <div className="panel">
          <h3>How this was ranked</h3>
          <p className="soft small" style={{ marginTop: 6 }}>
            {b.source === "agent"
              ? <>Rules scored {b.counts.considered} workable accounts and passed the top of that list to {b.model}, which chose and ordered these five and wrote each reason. Code then dropped anything it could not match to a real account and replaced any reason containing a number that is not in the account's facts. {moved === 0 ? "The model kept the rule order." : `The model moved ${moved} of ${b.items.length} from where the rules had them.`}</>
              : <>The model was unavailable or its answer failed the checks{b.note ? ` (${b.note})` : ""}, so this is the rule-based order: score, plus weight for customers, fresh postings, hard signals and work that is nearly finished.</>}
          </p>
          <table className="data" style={{ marginTop: 10 }}>
            <thead><tr><th>Account</th><th className="r">Rules</th><th className="r">Brief</th></tr></thead>
            <tbody>{b.items.map((i) => <tr key={i.accountId}><td>{i.name}</td><td className="r num">{i.rulePosition}</td><td className="r num">{i.rank}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="panel">
          <h3>The same brief in Slack</h3>
          <p className="sub">Preview of the morning digest. Slack is not connected in this demo.</p>
          <div className="slack" style={{ marginTop: 10 }}>
            <div className="av"><Mark size={26} /></div>
            <div>
              <div className="who">Alpha Desk <span>APP</span></div>
              <div style={{ fontWeight: 700, marginTop: 2 }}>{b.headline}</div>
              {b.items.map((i) => <div key={i.accountId} style={{ marginTop: 4 }}><b>{i.rank}. {i.name}</b> ({i.score}): {i.why}</div>)}
              <div className="sbtns"><span className="p">Open today's desk</span></div>
            </div>
          </div>
        </div>
      </div>
      <p className="small muted" style={{ marginTop: 16 }}>Written {dateTime(b.createdAt)}. Rebuilt every morning before the US working day.</p>
    </div>
  );
}
