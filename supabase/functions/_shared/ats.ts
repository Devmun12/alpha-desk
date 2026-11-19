// Public ATS job-board adapters. All three APIs are public, unauthenticated and
// designed to be read by career sites, so this is the same data a candidate sees.
//   Greenhouse: https://developers.greenhouse.io/job-board.html
//   Lever:      https://github.com/lever/postings-api
//   Ashby:      https://developers.ashbyhq.com/docs/public-job-posting-api

export type Ats = "greenhouse" | "lever" | "ashby";

export interface Posting {
  ats: Ats;
  externalId: string;
  title: string;
  department: string | null;
  location: string | null;
  url: string | null;
  postedAt: string | null;
  text: string; // plain text body; empty when the board omits it
}

const UA = "AlphaDesk/1.0 (+https://github.com/Devmun12)";

async function getJson(url: string, timeoutMs = 25_000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: ctrl.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", bull: "•", middot: "·",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** HTML -> readable plain text that keeps list items and paragraphs on their own lines. */
export function htmlToText(html: string): string {
  let s = decodeEntities(html); // Greenhouse double-encodes: entities first, then tags
  s = s
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/li|\/ul|\/ol|\/tr)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l, i, arr) => l.length > 0 || (i > 0 && arr[i - 1].length > 0))
    .join("\n")
    .trim();
}

interface GhJob {
  id: number; title: string; absolute_url?: string; updated_at?: string; first_published?: string;
  location?: { name?: string }; departments?: { name?: string }[]; content?: string;
}
interface LeverJob {
  id: string; text: string; hostedUrl?: string; createdAt?: number;
  categories?: { team?: string; department?: string; location?: string };
  descriptionPlain?: string; lists?: { text?: string; content?: string }[]; additionalPlain?: string;
}
interface AshbyJob {
  id: string; title: string; department?: string; team?: string; location?: string;
  publishedAt?: string; jobUrl?: string; descriptionPlain?: string; descriptionHtml?: string; isListed?: boolean;
}

export async function fetchBoard(
  ats: Ats,
  slug: string,
  wantBody?: (title: string, department: string | null) => boolean,
): Promise<Posting[] | null> {
  if (ats === "greenhouse") {
    // List without bodies (cheap), then fetch bodies only for postings the title screen keeps.
    const data = (await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`)) as { jobs?: GhJob[] } | null;
    if (!data?.jobs) return null;
    const out: Posting[] = data.jobs.map((j) => ({
      ats,
      externalId: `${slug}:${j.id}`,
      title: j.title.trim(),
      department: j.departments?.map((d) => d.name).filter(Boolean).join(" / ") || null,
      location: j.location?.name ?? null,
      url: j.absolute_url ?? null,
      postedAt: j.first_published ?? j.updated_at ?? null,
      text: "",
    }));
    const want = out.filter((p) => wantBody ? wantBody(p.title, p.department) : true);
    let i = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (i < want.length) {
        const p = want[i++];
        const id = p.externalId.split(":")[1];
        const d = (await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${id}`).catch(() => null)) as GhJob | null;
        if (d?.content) p.text = htmlToText(d.content);
        if (d?.departments?.length) p.department = d.departments.map((x) => x.name).filter(Boolean).join(" / ");
      }
    }));
    return out;
  }
  if (ats === "lever") {
    const data = (await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`)) as LeverJob[] | null;
    if (!Array.isArray(data)) return null;
    return data.map((j) => {
      const department = [j.categories?.department, j.categories?.team].filter(Boolean).join(" / ") || null;
      const keep = !wantBody || wantBody(j.text, department);
      return {
        ats,
        externalId: `${slug}:${j.id}`,
        title: j.text.trim(),
        department,
        location: j.categories?.location ?? null,
        url: j.hostedUrl ?? null,
        postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
        text: keep
          ? [
            j.descriptionPlain ?? "",
            ...(j.lists ?? []).map((l) => `${l.text ?? ""}\n${htmlToText(l.content ?? "")}`),
            j.additionalPlain ?? "",
          ].join("\n\n").trim()
          : "",
      };
    });
  }
  const data = (await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}`)) as { jobs?: AshbyJob[] } | null;
  if (!data?.jobs) return null;
  return data.jobs
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const department = [j.department, j.team].filter(Boolean).join(" / ") || null;
      const keep = !wantBody || wantBody(j.title, department);
      return {
        ats,
        externalId: `${slug}:${j.id}`,
        title: j.title.trim(),
        department,
        location: j.location ?? null,
        url: j.jobUrl ?? null,
        postedAt: j.publishedAt ?? null,
        text: keep ? (j.descriptionPlain ?? (j.descriptionHtml ? htmlToText(j.descriptionHtml) : "")).trim() : "",
      };
    });
}

export async function sha1(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
