import { describe, expect, it } from "vitest";
import {
  generateQuestions,
  type GenerationContext,
} from "../../../src/pipeline/generation/question-generator.js";
import type { Requirement } from "../../../src/pipeline/kit.schema.js";
import type { JsonLlm } from "../../../src/pipeline/llm/port.js";
import { NO_HIRING_SIGNALS } from "../../../src/pipeline/research/hiring-signals.js";

const context: GenerationContext = {
  roleTitle: "Backend Engineer",
  seniority: "senior",
  companyName: "Acme",
  companyFacts: [],
  signals: NO_HIRING_SIGNALS,
};
const R = (id: string): Requirement => ({
  id,
  text: `Requirement ${id}`,
  kind: "technical",
  priority: "must",
});

function stub(output: unknown) {
  const calls: { schemaName: string; user: string }[] = [];
  const llm: JsonLlm = {
    completeJson: async (args) => (
      calls.push({ schemaName: args.schemaName, user: args.user }),
      output as never
    ),
  };
  return { llm, calls };
}

const question = (over: Record<string, unknown> = {}) => ({
  requirement_ids: ["r1"],
  prompt: "How would you debug a slow query in production?",
  answer_outline: "a; b",
  difficulty: 2,
  ...over,
});

describe("generateQuestions", () => {
  it("drops unknown requirement ids and questions left with none", async () => {
    const { llm } = stub({
      questions: [
        question({ requirement_ids: ["r1", "r99"] }),
        question({
          requirement_ids: ["r99"],
          prompt: "A question that references nothing real at all.",
        }),
      ],
    });
    const result = await generateQuestions(llm, {
      category: "technical",
      requirements: [R("r1")],
      context,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.requirement_ids).toEqual(["r1"]);
  });

  it("clamps difficulty, trims long text and removes duplicates", async () => {
    const { llm } = stub({
      questions: [
        question({ difficulty: 7 }),
        question({ difficulty: 0, prompt: "how would you DEBUG a slow query in production" }),
        question({ prompt: "x".repeat(900) }),
      ],
    });
    const result = await generateQuestions(llm, {
      category: "technical",
      requirements: [R("r1")],
      context,
    });
    expect(result.map((q) => q.difficulty)).toEqual([3, 2]);
    expect(result[1]?.prompt).toHaveLength(400);
  });

  it("skips prompts that already exist elsewhere in the kit", async () => {
    const { llm } = stub({ questions: [question()] });
    const result = await generateQuestions(llm, {
      category: "technical",
      requirements: [R("r1")],
      context,
      existingPrompts: ["How would you debug a slow query in production?"],
    });
    expect(result).toEqual([]);
  });

  it("splits many requirements across several calls", async () => {
    const { llm, calls } = stub({ questions: [] });
    await generateQuestions(llm, {
      category: "technical",
      requirements: Array.from({ length: 7 }, (_, i) => R(`r${i + 1}`)),
      context,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.schemaName).toBe("questions_technical");
  });

  it("fences requirement text as untrusted and asks for system-design under its own schema name", async () => {
    const { llm, calls } = stub({ questions: [] });
    await generateQuestions(llm, { category: "system-design", requirements: [R("r1")], context });
    expect(calls[0]?.schemaName).toBe("questions_system_design");
    expect(calls[0]?.user).toContain("<untrusted_requirements>");
  });

  it("allows company-fit questions with no requirement ids", async () => {
    const { llm, calls } = stub({
      questions: [
        question({ requirement_ids: [], prompt: "Why do you want to work on this team?" }),
      ],
    });
    const result = await generateQuestions(llm, {
      category: "company-fit",
      requirements: [],
      context,
    });
    expect(calls).toHaveLength(1);
    expect(result[0]?.requirement_ids).toEqual([]);
    expect(calls[0]?.user).toContain("No facts about the company are available.");
  });
});
