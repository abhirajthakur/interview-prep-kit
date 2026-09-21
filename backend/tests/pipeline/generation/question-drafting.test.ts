import { describe, expect, it } from "vitest";
import {
  draftQuestions,
  planCategories,
} from "../../../src/pipeline/generation/question-drafting.js";
import type { GenerationContext } from "../../../src/pipeline/generation/question-generator.js";
import type { Requirement } from "../../../src/pipeline/kit.schema.js";
import { LlmError } from "../../../src/pipeline/llm/errors.js";
import type { JsonLlm } from "../../../src/pipeline/llm/port.js";
import { NO_HIRING_SIGNALS } from "../../../src/pipeline/research/hiring-signals.js";

const R = (
  id: string,
  kind: Requirement["kind"],
  priority: Requirement["priority"],
): Requirement => ({ id, text: `Requirement ${id}`, kind, priority });
const requirements = [
  R("r1", "technical", "must"),
  R("r2", "technical", "must"),
  R("r3", "technical", "must"),
  R("r4", "behavioural", "must"),
  R("r5", "technical", "nice"),
];

// Unknown seniority, so no system-design category muddies the coverage tests.
const context: GenerationContext = {
  roleTitle: "Engineer",
  seniority: "",
  companyName: "Acme",
  companyFacts: [],
  signals: NO_HIRING_SIGNALS,
};

/** Answers every requirement id found in the prompt, except the ones we tell it to skip. */
function scripted(
  options: {
    skipFirstTechnical?: string[];
    skipAlways?: string[];
    failFirstTechnical?: Error;
  } = {},
): { llm: JsonLlm; schemas: string[] } {
  const schemas: string[] = [];
  let technicalCalls = 0;
  const llm: JsonLlm = {
    completeJson: async ({ schemaName, user }) => {
      schemas.push(schemaName);
      if (schemaName === "questions_company_fit") return { questions: [] } as never;

      const skip = new Set(options.skipAlways ?? []);
      if (schemaName === "questions_technical") {
        technicalCalls++;
        if (technicalCalls === 1) {
          if (options.failFirstTechnical) throw options.failFirstTechnical;
          for (const id of options.skipFirstTechnical ?? []) skip.add(id);
        }
      }
      const ids = [...new Set(user.match(/\br\d+\b/g) ?? [])].filter((id) => !skip.has(id));
      return {
        questions: ids.map((id) => ({
          requirement_ids: [id],
          prompt: `Question about ${id} from ${schemaName}`,
          answer_outline: "a; b",
          difficulty: 2,
        })),
      } as never;
    },
  };
  return { llm, schemas };
}

describe("draftQuestions", () => {
  it("covers everything in one pass when the model cooperates", async () => {
    const { llm } = scripted();
    const result = await draftQuestions(llm, { requirements, context, thin: false });
    expect(result.passes).toBe(1);
    expect(result.uncoveredIds).toEqual([]);
    expect(result.questions.map((q) => q.id)).toEqual(result.questions.map((_, i) => `q${i + 1}`));
  });

  it("closes a coverage gap on the second pass", async () => {
    const { llm } = scripted({ skipFirstTechnical: ["r2"] });
    const result = await draftQuestions(llm, { requirements, context, thin: false });
    expect(result.passes).toBe(2);
    expect(result.uncoveredIds).toEqual([]);
    expect(result.fallbackRequirementIds).toEqual([]);
    expect(result.questions.some((q) => q.requirement_ids.includes("r2"))).toBe(true);
  });

  it("adds a template question when a must-have stays uncovered after three passes", async () => {
    const { llm } = scripted({ skipFirstTechnical: ["r2"], skipAlways: ["r3"] });
    const result = await draftQuestions(llm, { requirements, context, thin: false });
    expect(result.passes).toBe(3);
    expect(result.fallbackRequirementIds).toEqual(["r3"]);
    expect(result.uncoveredIds).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/template questions/);
  });

  it("stops early when a pass makes no progress", async () => {
    const { llm } = scripted({ skipAlways: ["r3"] });
    const result = await draftQuestions(llm, { requirements, context, thin: false });
    expect(result.passes).toBe(2);
    expect(result.fallbackRequirementIds).toEqual(["r3"]);
  });

  it("reports uncovered nice-to-haves instead of forcing a question", async () => {
    const { llm } = scripted({ skipAlways: ["r5"] });
    const result = await draftQuestions(llm, { requirements, context, thin: false });
    expect(result.uncoveredIds).toEqual(["r5"]);
    expect(result.fallbackRequirementIds).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/nice-to-have/);
  });

  it("recovers when one category returns unusable output", async () => {
    const { llm } = scripted({ failFirstTechnical: new LlmError("bad", "LLM_INVALID_OUTPUT") });
    const result = await draftQuestions(llm, { requirements, context, thin: false });
    expect(result.passes).toBe(2);
    expect(result.uncoveredIds).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/unusable output for technical/);
  });

  it("does not swallow fatal errors", async () => {
    const { llm } = scripted({ failFirstTechnical: new LlmError("bad key", "LLM_AUTH") });
    await expect(draftQuestions(llm, { requirements, context, thin: false })).rejects.toMatchObject(
      { code: "LLM_AUTH" },
    );
  });

  it("makes separate calls per category", async () => {
    const { llm, schemas } = scripted();
    await draftQuestions(llm, { requirements, context, thin: false });
    expect(schemas).toEqual([
      "questions_technical",
      "questions_behavioural",
      "questions_company_fit",
    ]);
  });
});

describe("planCategories", () => {
  const plan = (over: Partial<Parameters<typeof planCategories>[0]> = {}) =>
    planCategories({
      requirements,
      seniority: "senior",
      thin: false,
      signalsMentionDesign: false,
      ...over,
    }).map((p) => p.category);

  it("adds system design for a senior, non-thin role", () => {
    expect(plan()).toEqual(["technical", "behavioural", "system-design", "company-fit"]);
  });

  it("skips system design for junior or unknown seniority unless the company's process includes it", () => {
    expect(plan({ seniority: "junior" })).not.toContain("system-design");
    expect(plan({ seniority: "" })).not.toContain("system-design");
    expect(plan({ seniority: "", signalsMentionDesign: true })).toContain("system-design");
  });

  it("keeps thin kits thin, but still respects the company's published design round", () => {
    expect(plan({ thin: true })).not.toContain("system-design");
    expect(plan({ thin: true, signalsMentionDesign: true })).toContain("system-design");
  });

  it("only plans categories that have requirements", () => {
    expect(plan({ requirements: [R("r1", "behavioural", "must")] })).toEqual([
      "behavioural",
      "company-fit",
    ]);
  });
});
