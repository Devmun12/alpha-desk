// Thin Gemini client: model discovery, JSON-schema constrained output, retries with
// fallback across models (free-tier quotas are per model), and token accounting.

const API = "https://generativelanguage.googleapis.com/v1beta";

export interface LlmResult<T> {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  /** Models that were tried and failed before this one answered, with the reason. */
  skipped: string[];
}

export class LlmError extends Error {
  constructor(message: string, public status?: number, public retryable = false) {
    super(message);
  }
}

function key(): string {
  const k = Deno.env.get("GEMINI_API_KEY");
  if (!k) throw new LlmError("GEMINI_API_KEY is not set", 412);
  return k;
}

export function hasKey(): boolean {
  return !!Deno.env.get("GEMINI_API_KEY");
}

let cachedModels: string[] | null = null;

function versionOf(name: string): number {
  const m = name.match(/gemini-(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

/**
 * Ordered list of models to try. GEMINI_MODELS (comma separated) wins; otherwise ask the
 * API which Flash models this key can call and prefer newest stable Flash, then Flash-Lite.
 */
export async function models(): Promise<string[]> {
  const pinned = Deno.env.get("GEMINI_MODELS");
  if (pinned) return pinned.split(",").map((s) => s.trim()).filter(Boolean);
  if (cachedModels) return cachedModels;
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": key() } });
  if (!res.ok) throw new LlmError(`models.list ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
  const body = await res.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  const names = (body.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => /^gemini-\d+(\.\d+)?-flash(-lite)?(-preview[\w-]*|-\d{3})?$/.test(n));
  const rank = (n: string) =>
    (n.includes("-lite") ? 1 : 0) * 100 + (n.includes("preview") ? 10 : 0) - versionOf(n);
  cachedModels = names.sort((a, b) => rank(a) - rank(b));
  if (cachedModels.length === 0) cachedModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  return cachedModels;
}

interface CallOpts {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  prefer?: "quality" | "fast";
  /** Per-attempt ceiling. An edge function dies at 150s, so no single call may wait that long. */
  timeoutMs?: number;
}

/**
 * Order of models to try.
 *   fast:    Flash-Lite first (no thinking, ~2s), Flash as the fallback.
 *   quality: the two newest Flash models, then Flash-Lite as a safety net, so a quota or
 *            outage on one family never stops the job.
 */
export function modelOrder(all: string[], prefer: "quality" | "fast" | undefined): string[] {
  const lite = all.filter((m) => m.includes("lite"));
  const full = all.filter((m) => !m.includes("lite"));
  return prefer === "fast" ? [...lite, ...full].slice(0, 4) : [...full.slice(0, 2), ...lite.slice(0, 2)];
}

// A model that just failed is tried last for the next ten minutes, so one slow or
// over-quota model does not cost every later call a full timeout.
const coolUntil = new Map<string, number>();

export async function generateJson<T>(opts: CallOpts): Promise<LlmResult<T>> {
  const ordered = modelOrder(await models(), opts.prefer);
  const cooling = (m: string) => (coolUntil.get(m) ?? 0) > Date.now();
  const list = [...ordered.filter((m) => !cooling(m)), ...ordered.filter(cooling)];
  // Every failure is kept, so the run log says why a call failed and not only that it did.
  const trail: string[] = [];
  let quotaOnly = true;
  for (const model of list) {
    if (trail.length) coolUntil.set(list[list.indexOf(model) - 1], Date.now() + 10 * 60_000);
    // Flash models think before they answer and thinking tokens count against the output
    // limit. With a small limit the JSON is cut off mid-object, so Flash gets headroom.
    const maxOutputTokens = model.includes("lite") ? (opts.maxOutputTokens ?? 2048) : Math.max(opts.maxOutputTokens ?? 2048, 8192);
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      let res: Response;
      try {
        res = await fetch(`${API}/models/${model}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key() },
          signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: opts.system }] },
            contents: [{ role: "user", parts: [{ text: opts.user }] }],
            generationConfig: {
              temperature: opts.temperature ?? 0.1,
              maxOutputTokens,
              responseMimeType: "application/json",
              responseSchema: opts.schema,
            },
          }),
        });
      } catch (e) {
        if (e instanceof LlmError) throw e;
        trail.push(`${model}: ${(e as Error).name === "TimeoutError" ? "no answer in time" : (e as Error).message}`);
        quotaOnly = false;
        break;
      }
      const latencyMs = Date.now() - t0;
      if (res.status === 429 || res.status >= 500) {
        trail.push(`${model}: ${res.status}`);
        await res.body?.cancel();
        if (res.status !== 429) quotaOnly = false;
        if (res.status >= 500 && attempt === 0) { await new Promise((r) => setTimeout(r, 1500)); continue; }
        break; // quota or outage on this model: move to the next one
      }
      if (res.status === 404 || res.status === 400) {
        trail.push(`${model}: ${res.status} ${(await res.text()).replace(/\s+/g, " ").slice(0, 120)}`);
        quotaOnly = false;
        break;
      }
      if (!res.ok) throw new LlmError(`${model} ${res.status}: ${(await res.text()).slice(0, 400)}`, res.status);
      const body = await res.json() as {
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
      };
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      try {
        const data = JSON.parse(text) as T;
        return {
          data,
          model,
          inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: (body.usageMetadata?.candidatesTokenCount ?? 0) + (body.usageMetadata?.thoughtsTokenCount ?? 0),
          latencyMs,
          skipped: trail,
        };
      } catch {
        trail.push(`${model}: cut-off JSON (finish ${body.candidates?.[0]?.finishReason}, ${body.usageMetadata?.thoughtsTokenCount ?? 0} thinking tokens)`);
        quotaOnly = false;
        break; // the same request would fail the same way: try the next model
      }
    }
  }
  throw new LlmError(trail.join("; ").slice(0, 500) || "no model available", quotaOnly && trail.length > 0 ? 429 : 502, true);
}
