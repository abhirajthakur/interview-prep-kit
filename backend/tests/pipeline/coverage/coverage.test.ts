import { describe, expect, it } from "vitest";
import {
  findUncovered,
  mustNotScheduled,
  onlyMust,
} from "../../../src/pipeline/coverage/coverage.js";
import type { Question, Requirement } from "../../../src/pipeline/kit.schema.js";

const R = (id: string, priority: Requirement["priority"]): Requirement => ({
  id,
  text: `req ${id}`,
  kind: "technical",
  priority,
});
const Q = (id: string, requirementIds: string[]): Question => ({
  id,
  requirement_ids: requirementIds,
  category: "technical",
  prompt: `prompt ${id}`,
  answer_outline: "",
  difficulty: 2,
});

const requirements = [R("r1", "must"), R("r2", "must"), R("r3", "nice")];

describe("findUncovered", () => {
  it("returns every requirement when there are no questions", () => {
    expect(findUncovered(requirements, [])).toEqual(["r1", "r2", "r3"]);
  });

  it("returns only requirements no question references, in requirement order", () => {
    expect(findUncovered(requirements, [Q("q1", ["r2"])])).toEqual(["r1", "r3"]);
  });

  it("ignores unknown ids and counts multi-requirement questions", () => {
    expect(findUncovered(requirements, [Q("q1", ["r1", "r3", "r99"])])).toEqual(["r2"]);
  });

  it("returns nothing when everything is covered", () => {
    expect(findUncovered(requirements, [Q("q1", ["r1", "r2"]), Q("q2", ["r3"])])).toEqual([]);
  });
});

describe("onlyMust", () => {
  it("filters ids down to must-have requirements", () => {
    expect(onlyMust(requirements, ["r1", "r3"])).toEqual(["r1"]);
  });
});

describe("mustNotScheduled", () => {
  const questions = [Q("q1", ["r1"]), Q("q2", ["r2"])];

  it("reports must-haves whose questions are not in the schedule", () => {
    const schedule = {
      days_available: 1,
      days: [{ day: 1, focus: "", question_ids: ["q1"], minutes: 15 }],
    };
    expect(mustNotScheduled(requirements, questions, schedule)).toEqual(["r2"]);
  });

  it("is empty when every must-have is reachable through the schedule", () => {
    const schedule = {
      days_available: 1,
      days: [{ day: 1, focus: "", question_ids: ["q1", "q2"], minutes: 30 }],
    };
    expect(mustNotScheduled(requirements, questions, schedule)).toEqual([]);
  });
});
