import { describe, expect, it } from "vitest";
import { runBatch, toBatchOutput } from "../../src/pipeline/batch.js";
import { PipelineError } from "../../src/pipeline/errors.js";
import type { Kit } from "../../src/pipeline/kit.schema.js";
import { LlmError } from "../../src/pipeline/llm/errors.js";

const kit = (marker: string) => ({ marker }) as unknown as Kit;
const good = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  jd: `jd for ${id}`,
  company_url: `https://${id}.test`,
  days: 5,
  ...over,
});

describe("runBatch", () => {
  it("returns one entry per case, in order, keyed by the given id", async () => {
    const entries = await runBatch([good("a"), good("b")], async (_input, id) => kit(id));
    expect(entries.map((e) => [e.id, e.status])).toEqual([
      ["a", "ok"],
      ["b", "ok"],
    ]);
  });

  it("passes the days value of each case to the pipeline", async () => {
    const seen: number[] = [];
    await runBatch(
      [good("a", { days: 3 }), good("b", { days: "7" })],
      async (input) => (seen.push(input.days), kit("x")),
    );
    expect(seen).toEqual([3, 7]);
  });

  it("records a failure and carries on with the next case", async () => {
    const entries = await runBatch([good("a"), good("b"), good("c")], async (_input, id) => {
      if (id === "b") throw new LlmError("model down", "LLM_UNAVAILABLE");
      return kit(id);
    });
    expect(entries.map((e) => e.status)).toEqual(["ok", "failed", "ok"]);
    expect(entries[1]).toMatchObject({
      kit: null,
      error: { code: "LLM_UNAVAILABLE", message: "model down" },
    });
  });

  it("maps pipeline and unknown errors to codes", async () => {
    const entries = await runBatch([good("a"), good("b")], async (_input, id) => {
      if (id === "a") throw new PipelineError("empty", "INVALID_INPUT");
      throw new TypeError("boom");
    });
    expect(entries.map((e) => e.status === "failed" && e.error.code)).toEqual([
      "INVALID_INPUT",
      "INTERNAL_ERROR",
    ]);
  });

  it("fails a malformed case without aborting the run", async () => {
    let calls = 0;
    const entries = await runBatch(
      [{ id: "bad", jd: "x", company_url: "u" }, good("ok")],
      async () => (calls++, kit("k")),
    );
    expect(entries[0]).toMatchObject({
      id: "bad",
      status: "failed",
      error: { code: "INVALID_INPUT" },
    });
    expect(entries[1]?.status).toBe("ok");
    expect(calls).toBe(1);
  });

  it("gives a case without an id a positional one", async () => {
    const entries = await runBatch(["nonsense", good("b")], async () => kit("k"));
    expect(entries[0]).toMatchObject({ id: "case-1", status: "failed" });
  });

  it("computes an identical posting only once", async () => {
    let calls = 0;
    const same = { jd: "same jd", company_url: "https://same.test", days: 5 };
    const entries = await runBatch(
      [
        { id: "a", ...same },
        { id: "b", ...same },
      ],
      async () => (calls++, kit("k")),
    );
    expect(calls).toBe(1);
    expect(entries.map((e) => e.status)).toEqual(["ok", "ok"]);
    expect(entries[0]?.kit).not.toBe(entries[1]?.kit); // a copy, not the same object
  });

  it("does not reuse a failed run", async () => {
    let calls = 0;
    const same = { jd: "same jd", company_url: "https://same.test", days: 5 };
    const entries = await runBatch(
      [
        { id: "a", ...same },
        { id: "b", ...same },
      ],
      async () => {
        if (calls++ === 0) throw new Error("flaky");
        return kit("k");
      },
    );
    expect(entries.map((e) => e.status)).toEqual(["failed", "ok"]);
  });
});

describe("toBatchOutput", () => {
  it("uses the Appendix B envelope with a seconds-precision timestamp", () => {
    const out = toBatchOutput([], new Date("2026-09-01T09:12:44.512Z"));
    expect(out).toEqual({ version: "1.0", generated_at: "2026-09-01T09:12:44Z", kits: [] });
  });
});
