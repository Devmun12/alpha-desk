// Thin Gemini client: model discovery, JSON-schema constrained output, retries with
// fallback across models (free-tier quotas are per model), and token accounting.

const API = "https://generativelanguage.googleapis.com/v1beta";

export interface LlmResult<T> {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
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
}

export async function generateJson<T>(opts: CallOpts): Promise<LlmResult<T>> {
  let list = await models();
  if (opts.prefer === "fast") {
    const lite = list.filter((m) => m.includes("lite"));
    list = [...lite, ...list.filter((m) => !m.includes("lite"))];
  }
  let lastErr: LlmError | null = null;
  for (const model of list.slice(0, 4)) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      const res = await fetch(`${API}/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key() },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: opts.system }] },
          contents: [{ role: "user", parts: [{ text: opts.user }] }],
          generationConfig: {
            temperature: opts.temperature ?? 0.1,
            maxOutputTokens: opts.maxOutputTokens ?? 2048,
            responseMimeType: "application/json",
            responseSchema: opts.schema,
          },
        }),
      });
      const latencyMs = Date.now() - t0;
      if (res.status === 429 || res.status >= 500) {
        lastErr = new LlmError(`${model} ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status, true);
        if (res.status >= 500 && attempt === 0) { await new Promise((r) => setTimeout(r, 1500)); continue; }
        break; // quota on this model: move to the next one
      }
      if (res.status === 404) {
        lastErr = new LlmError(`${model} unavailable for this key`, 404);
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
        };
      } catch {
        lastErr = new LlmError(`${model} returned non-JSON (finish: ${body.candidates?.[0]?.finishReason})`, 502, true);
      }
    }
  }
  throw lastErr ?? new LlmError("no model succeeded");
}
