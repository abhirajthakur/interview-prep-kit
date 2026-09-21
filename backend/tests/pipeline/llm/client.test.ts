import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LlmClient } from "../../../src/pipeline/llm/client.js";

const schema = z.object({ ok: z.boolean() });

const completion = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }), {
    status: 200,
  });

function make(responses: (Response | Error)[]) {
  const bodies: any[] = [];
  const sleeps: number[] = [];
  const fetchImpl = (async (_u: unknown, init: RequestInit) => {
    bodies.push(JSON.parse(init.body as string));
    const next = responses.shift();
    if (!next) {
      throw new Error("no scripted response left");
    }

    if (next instanceof Error) {
      throw next;
    }

    return next;
  }) as unknown as typeof fetch;

  const client = new LlmClient({
    config: { apiKey: "k", model: "openai/gpt-oss-120b" },
    fetchImpl,
    sleep: async (ms) => void sleeps.push(ms),
  });
  const call = () => client.completeJson({ system: "s", user: "u", schema, schemaName: "t" });
  return { call, bodies, sleeps, client };
}

describe("LlmClient", () => {
  it("returns validated JSON and sends a strict json_schema request", async () => {
    const { call, bodies } = make([completion('{"ok":true}')]);
    await expect(call()).resolves.toEqual({ ok: true });
    expect(bodies[0].response_format.type).toBe("json_schema");
  });

  it("strips code fences", async () => {
    const { call } = make([completion('```json\n{"ok":true}\n```')]);
    await expect(call()).resolves.toEqual({ ok: true });
  });

  it("waits for retry-after on a 429, then succeeds", async () => {
    const { call, sleeps, bodies } = make([
      new Response("{}", { status: 429, headers: { "retry-after": "2" } }),
      completion('{"ok":true}'),
    ]);
    await call();
    expect(bodies).toHaveLength(2);
    expect(sleeps.some((ms) => ms >= 1900)).toBe(true);
  });

  it("asks for one repair on invalid output", async () => {
    const { call, bodies } = make([completion("not json"), completion('{"ok":true}')]);
    await expect(call()).resolves.toEqual({ ok: true });
    expect(bodies[1].messages).toHaveLength(4);
  });

  it("gives up with LLM_INVALID_OUTPUT after a failed repair", async () => {
    const { call } = make([completion("nope"), completion('{"ok":"yes"}')]);
    await expect(call()).rejects.toMatchObject({ code: "LLM_INVALID_OUTPUT" });
  });

  it("does not retry auth failures", async () => {
    const { call, bodies } = make([new Response("{}", { status: 401 })]);
    await expect(call()).rejects.toMatchObject({ code: "LLM_AUTH" });
    expect(bodies).toHaveLength(1);
  });

  it("falls back to json_object when json_schema is rejected", async () => {
    const { call, bodies } = make([new Response("{}", { status: 400 }), completion('{"ok":true}')]);
    await call();
    expect(bodies[1].response_format.type).toBe("json_object");
  });

  it("retries network errors", async () => {
    const { call, bodies } = make([new TypeError("fetch failed"), completion('{"ok":true}')]);
    await call();
    expect(bodies).toHaveLength(2);
  });

  it("adds up the token usage the provider reports", async () => {
    const withUsage = new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }],
        usage: { prompt_tokens: 40, completion_tokens: 10, total_tokens: 50 },
      }),
      { status: 200 },
    );
    const { call, client } = make([withUsage]);
    await call();
    expect(client.tokensUsed).toBe(50);
  });
});
