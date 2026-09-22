import { describe, expect, it } from "vitest";
import { PipelineError } from "../../../src/pipeline/errors.js";
import type { Flashcard, Question, Requirement } from "../../../src/pipeline/kit.schema.js";
import type { GenerationContext } from "../../../src/pipeline/generation/question-generator.js";
import {
  regenerateFlashcards,
  regenerateQuestionCategory,
} from "../../../src/pipeline/generation/regenerate.js";
import type { JsonLlm } from "../../../src/pipeline/llm/port.js";
import { NO_HIRING_SIGNALS } from "../../../src/pipeline/research/hiring-signals.js";

const R = (
  id: string,
  kind: Requirement["kind"] = "technical",
  priority: Requirement["priority"] = "must",
): Requirement => ({
  id,
  text: `Requirement ${id}`,
  kind,
  priority,
});
const Q = (
  id: string,
  category: Question["category"],
  requirementIds: string[],
  over: Partial<Question> = {},
): Question => ({
  id,
  category,
  requirement_ids: requirementIds,
  prompt: `Existing prompt for ${id}`,
  answer_outline: "o",
  difficulty: 2,
  origin: "generated",
  edited: false,
  pinned: false,
  ...over,
});
const F = (id: string, requirementIds: string[], over: Partial<Flashcard> = {}): Flashcard => ({
  id,
  front: `Front ${id}`,
  back: `Back ${id}`,
  requirement_ids: requirementIds,
  origin: "generated",
  edited: false,
  pinned: false,
  ...over,
});

const context: GenerationContext = {
  roleTitle: "Engineer",
  seniority: "senior",
  companyName: "Acme",
  companyFacts: [],
  signals: NO_HIRING_SIGNALS,
};

function scripted(options: { skipAlways?: string[] } = {}) {
  const llm: JsonLlm = {
    completeJson: async ({ user }) => {
      const ids = [...new Set(user.match(/\br\d+\b/g) ?? [])].filter(
        (id) => !(options.skipAlways ?? []).includes(id),
      );
      return {
        questions: ids.map((id) => ({
          requirement_ids: [id],
          prompt: `Fresh question about ${id}`,
          answer_outline: "a; b",
          difficulty: 2,
        })),
      } as never;
    },
  };
  return llm;
}

describe("regenerateQuestionCategory", () => {
  const requirements = [R("r1"), R("r2"), R("r3")];

  it("keeps pinned, edited and manual questions in the category, and every other category, untouched", async () => {
    const pinned = Q("q1", "technical", ["r1"], { pinned: true });
    const edited = Q("q2", "technical", ["r2"], { edited: true });
    const manual = Q("q3", "technical", [], { origin: "manual" });
    const plain = Q("q4", "technical", ["r3"]);
    const other = Q("q5", "behavioural", []);

    const result = await regenerateQuestionCategory(scripted(), {
      category: "technical",
      allRequirements: requirements,
      currentQuestions: [pinned, edited, manual, plain, other],
      context,
      thin: false,
    });

    const byId = new Map(result.questions.map((q) => [q.id, q]));
    expect(byId.get("q1")).toEqual(pinned);
    expect(byId.get("q2")).toEqual(edited);
    expect(byId.get("q3")).toEqual(manual);
    expect(byId.get("q5")).toEqual(other);
    expect(byId.has("q4")).toBe(false);
    expect(
      result.questions.some(
        (q) => q.category === "technical" && q.requirement_ids.includes("r3") && q.id !== "q4",
      ),
    ).toBe(true);
  });

  it("assigns fresh ids that never collide with an existing id in the kit", async () => {
    const result = await regenerateQuestionCategory(scripted(), {
      category: "technical",
      allRequirements: [R("r1")],
      currentQuestions: [Q("q7", "technical", ["r1"])],
      context,
      thin: false,
    });
    expect(result.questions.some((q) => q.id === "q7")).toBe(false);
    expect(new Set(result.questions.map((q) => q.id)).size).toBe(result.questions.length);
  });

  it("adds a template question when a must-have is never covered, even after gap-fill passes", async () => {
    const result = await regenerateQuestionCategory(scripted({ skipAlways: ["r2"] }), {
      category: "technical",
      allRequirements: requirements,
      currentQuestions: [Q("q1", "technical", ["r1", "r2", "r3"])],
      context,
      thin: false,
    });
    expect(result.questions.some((q) => q.requirement_ids.includes("r2"))).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/template question/);
  });

  it("closes a gap on a gap-fill retry when the model covers it the second time", async () => {
    let call = 0;
    const llm: JsonLlm = {
      completeJson: async ({ user }) => {
        call++;
        const ids = [...new Set(user.match(/\br\d+\b/g) ?? [])];
        const answer = call === 1 ? ids.filter((id) => id !== "r2") : ids; // first pass "forgets" r2
        return {
          questions: answer.map((id) => ({
            requirement_ids: [id],
            prompt: `Fresh ${id} call ${call}`,
            answer_outline: "a; b",
            difficulty: 2,
          })),
        } as never;
      },
    };
    const result = await regenerateQuestionCategory(llm, {
      category: "technical",
      allRequirements: requirements,
      currentQuestions: [Q("q1", "technical", ["r1", "r2", "r3"])],
      context,
      thin: false,
    });
    expect(result.questions.some((q) => q.requirement_ids.includes("r2"))).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(call).toBeGreaterThanOrEqual(2);
  });

  it("throws when the category does not apply to this kit", async () => {
    await expect(
      regenerateQuestionCategory(scripted(), {
        category: "system-design",
        allRequirements: [R("r1", "technical", "nice")],
        currentQuestions: [],
        context,
        thin: true,
      }),
    ).rejects.toBeInstanceOf(PipelineError);
  });
});

describe("regenerateFlashcards", () => {
  it("keeps touched cards and only generates for requirements no kept card covers", async () => {
    const kept = F("f1", ["r1"], { pinned: true });
    let promptSeen = "";
    const llm: JsonLlm = {
      completeJson: async ({ user }) => {
        promptSeen = user;
        return {
          flashcards: [{ requirement_ids: ["r2"], front: "New front", back: "New back" }],
        } as never;
      },
    };
    const result = await regenerateFlashcards(llm, {
      requirements: [R("r1"), R("r2")],
      currentFlashcards: [kept],
      roleTitle: "Engineer",
      seniority: "senior",
    });
    expect(result).toContainEqual(kept);
    expect(promptSeen).toContain("r2");
    expect(result.some((f) => f.requirement_ids.includes("r2"))).toBe(true);
  });

  it("makes no call and returns only kept cards when everything is already covered", async () => {
    let calls = 0;
    const llm: JsonLlm = { completeJson: async () => (calls++, { flashcards: [] } as never) };
    const kept = F("f1", ["r1"], { pinned: true });
    const result = await regenerateFlashcards(llm, {
      requirements: [R("r1")],
      currentFlashcards: [kept],
      roleTitle: "Engineer",
      seniority: "senior",
    });
    expect(calls).toBe(0);
    expect(result).toEqual([kept]);
  });

  it("assigns fresh ids that never collide with an existing id", async () => {
    const llm: JsonLlm = {
      completeJson: async () =>
        ({ flashcards: [{ requirement_ids: ["r2"], front: "f", back: "b" }] }) as never,
    };
    const result = await regenerateFlashcards(llm, {
      requirements: [R("r2")],
      currentFlashcards: [F("f9", ["r1"])],
      roleTitle: "Engineer",
      seniority: "senior",
    });
    expect(new Set(result.map((f) => f.id)).size).toBe(result.length);
  });
});
