import { z } from "zod";
import type { PipelineConfig } from "../config.js";
import { noopLogger, type Logger } from "../logger.js";
import { LlmError } from "./errors.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_WAIT_MS = 60_000;

export type CompleteJsonArgs<T> = {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  schemaName: string;
  maxTokens?: number;
};

export type LlmClientOptions = {
  config: Pick<PipelineConfig, "apiKey" | "model">;
  logger?: Logger;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
};

type Message = { role: "system" | "user" | "assistant"; content: string };

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}

export class LlmClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly logger: Logger;
  private readonly maxAttempts: number;
  /** After any 429, every caller waits until this time (safe if calls ever run in parallel). */
  private pausedUntil = 0;

  constructor(private readonly opts: LlmClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
    this.logger = opts.logger ?? noopLogger;
    this.maxAttempts = opts.maxAttempts ?? 6;
  }

  async completeJson<T>(args: CompleteJsonArgs<T>): Promise<T> {
    const { $schema: _omit, ...jsonSchema } = z.toJSONSchema(args.schema) as Record<
      string,
      unknown
    >;

    let strictMode = true;
    let repaired = false;
    let lastError: unknown;
    let extra: Message[] = [];

    const buildMessages = (): Message[] => [
      {
        role: "system",
        content:
          `${args.system}\n\nRespond with a single JSON object and nothing else.` +
          (strictMode ? "" : `\nIt must match this JSON Schema:\n${JSON.stringify(jsonSchema)}`),
      },
      { role: "user", content: args.user },
      ...extra,
    ];

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const wait = this.pausedUntil - Date.now();
      if (wait > 0) await this.sleep(wait);

      let res: Response;
      try {
        res = await this.post(buildMessages(), args, strictMode, jsonSchema);
      } catch (e) {
        lastError = e;
        this.logger.warn("llm network error", { attempt, error: String(e) });
        await this.sleep(this.backoff(attempt));
        continue;
      }

      if (res.status === 429) {
        const ms = Math.min(MAX_WAIT_MS, this.retryAfterMs(res) ?? this.backoff(attempt));
        this.pausedUntil = Date.now() + ms;
        lastError = new Error("rate limited (429)");
        this.logger.warn("llm rate limited", { attempt, waitMs: ms });
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new LlmError(`LLM provider rejected the API key (HTTP ${res.status}).`, "LLM_AUTH");
      }
      if (res.status === 413) {
        throw new LlmError(
          "Prompt is too large for the model's token limit.",
          "LLM_REQUEST_TOO_LARGE",
        );
      }
      if (res.status === 400 && strictMode) {
        // Usually a schema feature the strict mode can't handle. Fall back to plain JSON mode.
        strictMode = false;
        this.logger.warn("llm 400 in json_schema mode; retrying as json_object");
        continue;
      }
      if (res.status >= 500 || res.status === 408) {
        lastError = new Error(`provider error HTTP ${res.status}`);
        await this.sleep(this.backoff(attempt));
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new LlmError(`LLM rejected the request: ${body.slice(0, 300)}`, "LLM_BAD_REQUEST");
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
      };
      const content = data.choices?.[0]?.message?.content ?? "";
      const truncated = data.choices?.[0]?.finish_reason === "length";

      try {
        return args.schema.parse(JSON.parse(stripFences(content)));
      } catch (parseError) {
        lastError = parseError;
        if (repaired) {
          throw new LlmError(
            `Model returned invalid JSON twice for ${args.schemaName}.`,
            "LLM_INVALID_OUTPUT",
            {
              cause: parseError,
            },
          );
        }
        repaired = true;
        this.logger.warn("llm invalid output; asking for a repair", { truncated });
        extra = [
          { role: "assistant", content: content.slice(0, 2000) },
          {
            role: "user",
            content:
              `That was invalid: ${String(parseError instanceof Error ? parseError.message : parseError).slice(0, 400)}\n` +
              (truncated ? "It was cut off, so be more concise. " : "") +
              "Return the complete, corrected JSON object only.",
          },
        ];
      }
    }

    throw new LlmError(
      `LLM unavailable after ${this.maxAttempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      "LLM_UNAVAILABLE",
      { cause: lastError },
    );
  }

  private post(
    messages: Message[],
    args: CompleteJsonArgs<unknown>,
    strictMode: boolean,
    jsonSchema: object,
  ) {
    const { model, apiKey } = this.opts.config;
    return this.fetchImpl(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_completion_tokens: args.maxTokens ?? 2000,
        response_format: strictMode
          ? {
              type: "json_schema",
              json_schema: { name: args.schemaName, strict: true, schema: jsonSchema },
            }
          : { type: "json_object" },
        // gpt-oss models spend output tokens on reasoning; keep it short on a small free-tier budget.
        ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
      }),
      signal: AbortSignal.timeout(60_000),
    });
  }

  private retryAfterMs(res: Response): number | null {
    const v = Number(res.headers.get("retry-after"));
    return Number.isFinite(v) && v > 0 ? Math.ceil(v * 1000) : null;
  }

  private backoff(attempt: number): number {
    return Math.min(20_000, 1_000 * 2 ** (attempt - 1)) * (0.5 + Math.random() / 2);
  }
}
