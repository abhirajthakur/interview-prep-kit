import { describe, expect, it } from "vitest";
import { generateFlashcards } from "../../../src/pipeline/generation/flashcards.js";
import type { Requirement } from "../../../src/pipeline/kit.schema.js";
import type { JsonLlm } from "../../../src/pipeline/llm/port.js";

const R = (id: string): Requirement => ({
  id,
  text: `Requirement ${id}`,
  kind: "technical",
  priority: "must",
});
const args = (requirements: Requirement[]) => ({
  requirements,
  roleTitle: "Engineer",
  seniority: "senior",
});

function stub(output: unknown) {
  const state = { calls: 0 };
  const llm: JsonLlm = { completeJson: async () => (state.calls++, output as never) };
  return { llm, state };
}

describe("generateFlashcards", () => {
  it("drops unknown ids, empty cards and duplicate fronts", async () => {
    const { llm } = stub({
      flashcards: [
        {
          requirement_ids: ["r1"],
          front: "What is an index?",
          back: "A structure that speeds up lookups.",
        },
        { requirement_ids: ["r1"], front: "what is an INDEX", back: "Duplicate front." },
        { requirement_ids: ["r9"], front: "Unknown requirement?", back: "Dropped." },
        { requirement_ids: ["r1"], front: "", back: "No front." },
      ],
    });
    const cards = await generateFlashcards(llm, args([R("r1")]));
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ requirement_ids: ["r1"], origin: "generated" });
  });

  it("splits large requirement lists into several calls", async () => {
    const { llm, state } = stub({ flashcards: [] });
    await generateFlashcards(llm, args(Array.from({ length: 12 }, (_, i) => R(`r${i + 1}`))));
    expect(state.calls).toBe(2);
  });

  it("makes no call without requirements", async () => {
    const { llm, state } = stub({ flashcards: [] });
    expect(await generateFlashcards(llm, args([]))).toEqual([]);
    expect(state.calls).toBe(0);
  });
});
