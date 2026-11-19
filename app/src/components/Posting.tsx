import { useMemo, useState } from "react";
import type { Signal } from "../types";
import { excerpt, locate, segments } from "../lib/highlight";
import { FAMILY, ROLE, SIGNAL, familyOf } from "../data/taxonomy";
import { ago, date } from "../lib/format";
import { IconDown, IconExternal, IconUp } from "./icons";

interface Props {
  signal: Signal;
  points?: Partial<Record<string, number>>;
  feedback?: "up" | "down";
  onFeedback?: (v: "up" | "down") => void;
  /** Optional override for text that is not stored with the signal (live analysis). */
  text?: string;
}

/**
 * The signature view: the company's own posting, set in serif, with the AI's verified
 * evidence highlighted in place and explained in the margin.
 */
export function Posting({ signal, points = {}, feedback, onFeedback, text }: Props) {
  const content = text ?? signal.content ?? "";
  const [full, setFull] = useState(false);
  const spans = useMemo(() => locate(content, signal.evidence), [content, signal.evidence]);
  const ex = useMemo(() => excerpt(content, spans), [content, spans]);
  const shown = full ? { start: 0, end: content.length, text: content, clippedStart: false, clippedEnd: false } : ex;
  const segs = segments(shown.text, spans, shown.start);
  const unplaced = signal.evidence.filter((_, i) => !spans.some((s) => s.index === i));

  return (
    <article className="posting">
      <header className="posting-head">
        <div>
          <h3>{signal.title}</h3>
          <div className="meta">
            <span>{ROLE[signal.roleFamily] ?? signal.roleFamily}</span>
            {signal.location && <span>{signal.location}</span>}
            {signal.postedAt && <span title={date(signal.postedAt)}>Posted {ago(signal.postedAt)}</span>}
          </div>
        </div>
        {signal.url && (
          <a className="btn sm" href={signal.url} target="_blank" rel="noreferrer">
            Original posting <IconExternal />
          </a>
        )}
      </header>

      <div className="posting-body">
        <div className="source-text" lang="en">
          {content ? (
            <>
              {shown.clippedStart && <span className="elide">Earlier in the posting</span>}
              {segs.map((s, i) =>
                s.span ? (
                  <mark key={i} className="hl" style={{ ["--c" as string]: FAMILY[familyOf(s.span.ev.supports)].hl }}>
                    {s.text}<sup>{s.span.index + 1}</sup>
                  </mark>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
              {shown.clippedEnd && <span className="elide">Rest of the posting</span>}
            </>
          ) : (
            signal.evidence.map((e, i) => (
              <p key={i} style={{ marginBottom: 12 }}>
                <mark className="hl" style={{ ["--c" as string]: FAMILY[familyOf(e.supports)].hl }}>{e.quote}<sup>{i + 1}</sup></mark>
              </p>
            ))
          )}
          {unplaced.map((e) => (
            <p key={e.quote} style={{ marginTop: 10 }}>
              <mark className="hl" style={{ ["--c" as string]: FAMILY[familyOf(e.supports)].hl }}>{e.quote}</mark>
            </p>
          ))}
        </div>

        <aside className="margin" aria-label="Why these lines matter">
          {signal.evidence.map((e, i) => {
            const meta = SIGNAL[e.supports];
            return (
              <div className="note" key={i}>
                <span className="swatch" style={{ ["--c" as string]: FAMILY[familyOf(e.supports)].hl, marginTop: 3 }} />
                <div>
                  <b>{i + 1}. {meta?.label ?? e.supports}</b>
                  {points[e.supports] !== undefined && <span className="pts num">Adds up to {points[e.supports]} intent points</span>}
                </div>
              </div>
            );
          })}
          <p className="small soft" style={{ lineHeight: 1.45 }}>{signal.summary}</p>
        </aside>
      </div>

      <footer className="posting-foot">
        <div className="tools">
          {signal.tools.length > 0 ? (
            <>
              <span>Tools named</span>
              {signal.tools.map((t) => (
                <span className="pill" key={t.name} title={t.context.replace("_", " ")}>{t.name}</span>
              ))}
            </>
          ) : (
            <span>No tools named</span>
          )}
        </div>
        <div className="actions">
          {content && content.length > ex.text.length + 40 && (
            <button className="btn ghost sm" onClick={() => setFull((v) => !v)}>{full ? "Show highlights only" : "Show full posting"}</button>
          )}
          {onFeedback && (
            <>
              <span>Right signal?</span>
              <button className="btn ghost sm" aria-pressed={feedback === "up"} onClick={() => onFeedback("up")} title="Yes, this is a real buying signal">
                <IconUp style={{ color: feedback === "up" ? "var(--ok)" : undefined }} /><span className="visually-hidden">Yes</span>
              </button>
              <button className="btn ghost sm" aria-pressed={feedback === "down"} onClick={() => onFeedback("down")} title="No, the AI misread this">
                <IconDown style={{ color: feedback === "down" ? "var(--bad)" : undefined }} /><span className="visually-hidden">No</span>
              </button>
            </>
          )}
        </div>
      </footer>
    </article>
  );
}
