import { describe, expect, it } from "vitest";
import { kitSchema } from "../../src/pipeline/kit.schema.js";

const validKit = () => ({
  source: {
    company: "Acme",
    company_url: "https://acme.test",
    role: "Engineer",
    location: "",
    jd_chars: 100,
    researched_at: "2026-09-21T10:00:00Z",
    pages_used: [] as string[],
  },
  company_brief: { summary: "s", what_they_do: "w", sources: [] as string[] },
  role: {
    title: "Engineer",
    seniority: "senior",
    responsibilities: ["Build things"],
    requirements: [
      { id: "r1", text: "Node.js", kind: "technical", priority: "must" },
      { id: "r2", text: "Mentoring", kind: "behavioural", priority: "nice" },
    ],
  },
  questions: [
    {
      id: "q1",
      requirement_ids: ["r1"],
      category: "technical",
      prompt: "p1",
      answer_outline: "o",
      difficulty: 2,
    },
    {
      id: "q2",
      requirement_ids: ["r2"],
      category: "behavioural",
      prompt: "p2",
      answer_outline: "o",
      difficulty: 1,
    },
  ],
  flashcards: [{ id: "f1", front: "front", back: "back", requirement_ids: ["r1"] }],
  schedule: {
    days_available: 2,
    days: [
      { day: 1, focus: "a", question_ids: ["q1"], minutes: 15 },
      { day: 2, focus: "b", question_ids: ["q2"], minutes: 10 },
    ],
  },
  coverage: { uncovered_requirement_ids: [] as string[], passes: 1 },
});

type Kit = ReturnType<typeof validKit>;

const rejects = (mutate: (kit: Kit) => void, expected: RegExp) => {
  const kit = validKit();
  mutate(kit);
  const result = kitSchema.safeParse(kit);
  expect(result.success).toBe(false);
  if (!result.success)
    expect(result.error.issues.map((i) => i.message).join(" | ")).toMatch(expected);
};

describe("kitSchema", () => {
  it("accepts a valid kit and fills in the extension fields", () => {
    const result = kitSchema.safeParse(validKit());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.warnings).toEqual([]);
      expect(result.data.research.hiring_process.found).toBe(false);
    }
  });

  it("rejects a question that references an unknown requirement", () => {
    rejects((k) => void (k.questions[0]!.requirement_ids = ["r9"]), /unknown requirement r9/);
  });

  it("rejects duplicate ids", () => {
    rejects((k) => void (k.questions[1]!.id = "q1"), /Duplicate question id/);
    rejects((k) => void (k.role.requirements[1]!.id = "r1"), /Duplicate requirement id/);
  });

  it("rejects a schedule whose length differs from the days requested", () => {
    rejects((k) => void (k.schedule.days_available = 3), /2 days but 3 were requested/);
  });

  it("rejects out-of-order day numbers", () => {
    rejects((k) => void (k.schedule.days[1]!.day = 5), /1\.\.N in order/);
  });

  it("rejects a schedule entry that points at a missing question", () => {
    rejects((k) => void (k.schedule.days[0]!.question_ids = ["q7"]), /unknown question q7/);
  });

  it("rejects non-integer minutes and out-of-range difficulty", () => {
    rejects((k) => void (k.schedule.days[0]!.minutes = 1.5), /\bint/i);
    rejects((k) => void (k.questions[0]!.difficulty = 4), /<=\s*3|too big|at most/i);
    rejects((k) => void (k.questions[0]!.difficulty = 0), />=\s*1|too small|at least/i);
  });

  it("rejects values outside the allowed enums", () => {
    rejects(
      (k) => void ((k.role.requirements[0] as { priority: string }).priority = "should"),
      /./,
    );
    rejects((k) => void ((k.questions[0] as { category: string }).category = "trivia"), /./);
  });

  it("rejects an uncovered id that is not a requirement", () => {
    rejects((k) => void (k.coverage.uncovered_requirement_ids = ["r9"]), /not a known requirement/);
  });
});
