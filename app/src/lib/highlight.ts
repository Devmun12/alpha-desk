import type { Evidence } from "../types";

export interface Span { start: number; end: number; ev: Evidence; index: number }
export interface Segment { text: string; span?: Span }

/** Normalise text for matching while remembering where each character came from. */
function normWithMap(s: string, dropPunct: boolean): { text: string; map: number[] } {
  let out = "";
  const map: number[] = [];
  let lastSpace = true;
  for (let i = 0; i < s.length; i++) {
    let c = s[i];
    if ("‘’‛`´".includes(c)) c = "'";
    else if ("“”".includes(c)) c = '"';
    else if ("–—−".includes(c)) c = "-";
    else if ("•·▪●".includes(c)) c = " ";
    c = c.toLowerCase();
    if (dropPunct && !/[a-z0-9\s]/.test(c)) continue;
    if (/\s/.test(c)) {
      if (lastSpace) continue;
      c = " ";
      lastSpace = true;
    } else lastSpace = false;
    out += c;
    map.push(i);
  }
  return { text: out, map };
}

/** Locate each verified quote inside the posting. Quotes that cannot be placed are skipped. */
export function locate(content: string, evidence: Evidence[]): Span[] {
  const spans: Span[] = [];
  const passes = [normWithMap(content, false), normWithMap(content, true)];
  evidence.forEach((ev, index) => {
    for (const [p, drop] of [[passes[0], false], [passes[1], true]] as const) {
      const q = normWithMap(ev.quote, drop).text.trim().replace(/^["'.\s]+|["'.\s]+$/g, "");
      if (q.length < 8) continue;
      const at = p.text.indexOf(q);
      if (at >= 0) {
        const start = p.map[at];
        const end = p.map[Math.min(at + q.length - 1, p.map.length - 1)] + 1;
        if (!spans.some((s) => start < s.end && end > s.start)) spans.push({ start, end, ev, index });
        return;
      }
    }
  });
  return spans.sort((a, b) => a.start - b.start);
}

export function segments(text: string, spans: Span[], offset = 0): Segment[] {
  const out: Segment[] = [];
  let pos = 0;
  for (const s of spans) {
    const a = s.start - offset;
    const b = s.end - offset;
    if (b <= 0 || a >= text.length) continue;
    if (a > pos) out.push({ text: text.slice(pos, a) });
    out.push({ text: text.slice(Math.max(a, 0), b), span: s });
    pos = b;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}

/**
 * The paragraphs that contain highlights, with one paragraph of context either side,
 * so a rep reads the claim in its setting rather than as a pulled quote.
 */
export function excerpt(content: string, spans: Span[]): { start: number; end: number; text: string; clippedStart: boolean; clippedEnd: boolean } {
  if (spans.length === 0) {
    const end = Math.min(content.length, 900);
    return { start: 0, end, text: content.slice(0, end), clippedStart: false, clippedEnd: end < content.length };
  }
  const paras: [number, number][] = [];
  const re = /\n+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    paras.push([last, m.index]);
    last = m.index + m[0].length;
  }
  paras.push([last, content.length]);
  const keep = new Set<number>();
  paras.forEach(([a, b], i) => {
    if (spans.some((s) => s.start < b && s.end > a)) {
      keep.add(i);
      if (i > 0 && paras[i - 1][1] - paras[i - 1][0] < 260) keep.add(i - 1);
    }
  });
  const idx = [...keep].sort((x, y) => x - y);
  const start = paras[idx[0]][0];
  const end = paras[idx[idx.length - 1]][1];
  return { start, end, text: content.slice(start, end), clippedStart: start > 0, clippedEnd: end < content.length };
}
