import { describe, expect, it } from "vitest";
import { mustNotScheduled } from "../../../src/pipeline/coverage/coverage.js";
import type { Question, Requirement } from "../../../src/pipeline/kit.schema.js";
import { buildSchedule } from "../../../src/pipeline/scheduling/schedule.js";

const R = (id: string, priority: Requirement["priority"]): Requirement => ({
  id,
  text: `Requirement ${id}`,
  kind: "technical",
  priority,
});
const Q = (n: number, difficulty: number, requirementIds: string[]): Question => ({
  id: `q${n}`,
  requirement_ids: requirementIds,
  category: "technical",
  prompt: `prompt ${n}`,
  answer_outline: "",
  difficulty,
});

const requirements = [R("r1", "must"), R("r2", "must"), R("r3", "nice")];
// 12 questions: a mix of must / nice / no requirement and of difficulty.
const questions: Question[] = Array.from({ length: 12 }, (_, i) =>
  Q(i + 1, (i % 3) + 1, i % 4 === 3 ? [] : [["r1", "r2", "r3"][i % 3] as string]),
);

function priorityKey(question: Question): number {
  const priorities = question.requirement_ids.map(
    (id) => requirements.find((r) => r.id === id)?.priority,
  );
  const tier = priorities.includes("must") ? 0 : priorities.includes("nice") ? 1 : 2;
  return tier * 10 + (3 - question.difficulty);
}

describe("buildSchedule with more questions than days", () => {
  const schedule = buildSchedule({ questions, requirements, days: 5 });

  it("spans exactly the requested days, numbered in order", () => {
    expect(schedule.days_available).toBe(5);
    expect(schedule.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);
  });

  it("schedules every question exactly once and never leaves a day empty", () => {
    const ids = schedule.days.flatMap((d) => d.question_ids);
    expect([...ids].sort()).toEqual(questions.map((q) => q.id).sort());
    expect(schedule.days.every((d) => d.question_ids.length > 0)).toBe(true);
  });

  it("uses integer minutes and gives every day a focus", () => {
    for (const d of schedule.days) {
      expect(Number.isInteger(d.minutes)).toBe(true);
      expect(d.minutes).toBeGreaterThan(0);
      expect(d.focus.length).toBeGreaterThan(0);
    }
  });

  it("puts harder and higher-priority material earlier", () => {
    const byId = new Map(questions.map((q) => [q.id, q]));
    const keys = schedule.days
      .flatMap((d) => d.question_ids)
      .map((id) => priorityKey(byId.get(id) as Question));
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
  });

  it("keeps day lengths reasonably balanced", () => {
    const minutes = schedule.days.map((d) => d.minutes);
    expect(Math.max(...minutes) - Math.min(...minutes)).toBeLessThanOrEqual(30);
  });

  it("includes every must-have requirement", () => {
    expect(mustNotScheduled(requirements, questions, schedule)).toEqual([]);
  });
});

describe("buildSchedule edge cases", () => {
  it("puts everything on one day for a 1-day schedule", () => {
    const schedule = buildSchedule({ questions, requirements, days: 1 });
    expect(schedule.days).toHaveLength(1);
    expect(schedule.days[0]?.question_ids).toHaveLength(12);
  });

  it("gives one question per day when questions equal days", () => {
    const schedule = buildSchedule({ questions, requirements, days: 12 });
    expect(schedule.days.every((d) => d.question_ids.length === 1)).toBe(true);
  });

  it("fills a 60-day schedule with study days, then review days", () => {
    const schedule = buildSchedule({ questions, requirements, days: 60 });
    expect(schedule.days).toHaveLength(60);
    expect(
      schedule.days.every(
        (d) => d.question_ids.length > 0 && Number.isInteger(d.minutes) && d.minutes > 0,
      ),
    ).toBe(true);

    const studyIds = schedule.days.slice(0, 12).flatMap((d) => d.question_ids);
    expect(new Set(studyIds).size).toBe(12);
    expect(schedule.days[12]?.focus).toMatch(/^Review/);
    expect(schedule.days[59]?.focus).toMatch(/^Final run-through/);
    expect(mustNotScheduled(requirements, questions, schedule)).toEqual([]);
  });

  it("reviews must-have questions more often than the rest", () => {
    const schedule = buildSchedule({ questions, requirements, days: 40 });
    const counts = new Map<string, number>();
    for (const id of schedule.days.slice(12).flatMap((d) => d.question_ids))
      counts.set(id, (counts.get(id) ?? 0) + 1);
    const mustQuestion = questions.find((q) => q.requirement_ids.includes("r1")) as Question;
    const companyQuestion = questions.find((q) => q.requirement_ids.length === 0) as Question;
    expect(counts.get(mustQuestion.id) ?? 0).toBeGreaterThan(counts.get(companyQuestion.id) ?? 0);
  });

  it("handles a single question over several days", () => {
    const schedule = buildSchedule({ questions: [Q(1, 2, ["r1"])], requirements, days: 4 });
    expect(schedule.days.map((d) => d.question_ids)).toEqual([["q1"], ["q1"], ["q1"], ["q1"]]);
  });

  it("returns honest placeholder days when there are no questions", () => {
    const schedule = buildSchedule({ questions: [], requirements, days: 3 });
    expect(schedule.days).toHaveLength(3);
    expect(schedule.days.every((d) => d.question_ids.length === 0 && d.minutes === 0)).toBe(true);
  });

  it.each([0, -2, 1.5, Number.NaN])("rejects invalid day counts (%s)", (days) => {
    expect(() => buildSchedule({ questions, requirements, days })).toThrow(RangeError);
  });
});
