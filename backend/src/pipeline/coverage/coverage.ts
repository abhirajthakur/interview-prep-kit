import type { Question, Requirement } from "../kit.schema.js";
import type { Schedule } from "../scheduling/schedule.js";

/** Requirement ids (in requirement order) that no question references. */
export function findUncovered(
  requirements: readonly Requirement[],
  questions: readonly Pick<Question, "requirement_ids">[],
): string[] {
  const covered = new Set(questions.flatMap((q) => q.requirement_ids));
  return requirements.filter((r) => !covered.has(r.id)).map((r) => r.id);
}

export function onlyMust(requirements: readonly Requirement[], ids: readonly string[]): string[] {
  const must = new Set(requirements.filter((r) => r.priority === "must").map((r) => r.id));
  return ids.filter((id) => must.has(id));
}

/** Must-have requirement ids that no scheduled question covers. Should always be empty in a finished kit. */
export function mustNotScheduled(
  requirements: readonly Requirement[],
  questions: readonly Question[],
  schedule: Schedule,
): string[] {
  const scheduled = new Set(schedule.days.flatMap((d) => d.question_ids));
  const scheduledQuestions = questions.filter((q) => scheduled.has(q.id));
  return onlyMust(requirements, findUncovered(requirements, scheduledQuestions));
}
