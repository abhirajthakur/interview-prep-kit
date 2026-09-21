import type { Question, Requirement } from "../kit.schema.js";

export type ScheduleDay = { day: number; focus: string; question_ids: string[]; minutes: number };
export type Schedule = { days_available: number; days: ScheduleDay[] };

type Tier = 0 | 1 | 2; // 0: covers a must-have, 1: only nice-to-haves, 2: no requirement (company fit)
type Item = { question: Question; tier: Tier; minutes: number };
type RequirementsById = ReadonlyMap<string, Requirement>;

const STUDY_MINUTES: Readonly<Record<number, number>> = { 1: 10, 2: 15, 3: 20 };
const DEFAULT_STUDY_MINUTES = 15;
const REVIEW_MINUTES = 5;
const MAX_FOCUS_TEXT = 48;

const CATEGORY_LABEL: Record<Question["category"], string> = {
  technical: "Technical",
  behavioural: "Behavioural",
  "system-design": "System design",
  "company-fit": "Company fit",
};

const idNumber = (id: string): number => Number(id.replace(/\D/g, "")) || 0;
const shorten = (text: string): string =>
  text.length <= MAX_FOCUS_TEXT ? text : `${text.slice(0, MAX_FOCUS_TEXT - 1).trimEnd()}…`;

function tierOf(question: Question, byId: RequirementsById): Tier {
  const priorities = question.requirement_ids.map((id) => byId.get(id)?.priority);
  if (priorities.includes("must")) return 0;
  if (priorities.includes("nice")) return 1;
  return 2;
}

/** Highest priority first, then hardest first, then by id for a stable order. */
function prioritise(questions: readonly Question[], byId: RequirementsById): Item[] {
  return questions
    .map((question) => ({
      question,
      tier: tierOf(question, byId),
      minutes: STUDY_MINUTES[question.difficulty] ?? DEFAULT_STUDY_MINUTES,
    }))
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        b.question.difficulty - a.question.difficulty ||
        idNumber(a.question.id) - idNumber(b.question.id),
    );
}

function focusLabel(
  questions: readonly Question[],
  byId: RequirementsById,
  prefix: string,
): string {
  const counts = new Map<string, number>();
  for (const q of questions) {
    for (const id of q.requirement_ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || idNumber(a[0]) - idNumber(b[0]))
    .slice(0, 2)
    .map(([id]) => shorten(byId.get(id)?.text ?? id));
  if (top.length > 0) return `${prefix}${top.join(" · ")}`;
  const categories = [...new Set(questions.map((q) => CATEGORY_LABEL[q.category]))];
  return `${prefix}${categories.join(" & ") || "Company fit"}`;
}

function studyDay(day: number, items: readonly Item[], byId: RequirementsById): ScheduleDay {
  return {
    day,
    focus: focusLabel(
      items.map((i) => i.question),
      byId,
      "Study: ",
    ),
    question_ids: items.map((i) => i.question.id),
    minutes: items.reduce((sum, i) => sum + i.minutes, 0),
  };
}

function reviewDay(
  day: number,
  items: readonly Item[],
  byId: RequirementsById,
  prefix: string,
): ScheduleDay {
  return {
    day,
    focus: focusLabel(
      items.map((i) => i.question),
      byId,
      prefix,
    ),
    question_ids: items.map((i) => i.question.id),
    minutes: REVIEW_MINUTES * items.length,
  };
}

/**
 * Splits the priority-sorted list into `days` contiguous chunks of similar length in minutes.
 * Every day gets at least one item (requires items.length >= days).
 */
function chunkByMinutes(items: readonly Item[], days: number): Item[][] {
  const chunks: Item[][] = [];
  let index = 0;
  let remainingMinutes = items.reduce((sum, i) => sum + i.minutes, 0);

  for (let day = 1; day <= days; day++) {
    const daysLeft = days - day + 1;
    const target = remainingMinutes / daysLeft;
    const chunk: Item[] = [];
    let taken = 0;

    while (index < items.length) {
      const item = items[index];
      if (!item) break;
      const mustTake = chunk.length === 0 || daysLeft === 1;
      const leavesEnough = items.length - (index + 1) >= daysLeft - 1;
      if (!mustTake && !(leavesEnough && taken + item.minutes / 2 <= target)) break;
      chunk.push(item);
      taken += item.minutes;
      index++;
    }
    remainingMinutes -= taken;
    chunks.push(chunk);
  }
  return chunks;
}

/** Fewer questions than days: one study day each, then spaced review, ending on the hardest material. */
function spreadWithReview(
  items: readonly Item[],
  days: number,
  byId: RequirementsById,
): ScheduleDay[] {
  const result = items.map((item, i) => studyDay(i + 1, [item], byId));

  // Must-have questions appear twice in the review rotation, so they are revisited more often.
  const pool = [...items, ...items.filter((i) => i.tier === 0)];
  const perDay = items.length === 1 ? 1 : 2;
  let cursor = 0;

  for (let day = items.length + 1; day <= days; day++) {
    const chosen: Item[] = [];
    for (let scanned = 0; chosen.length < perDay && scanned < pool.length; scanned++) {
      const item = pool[cursor % pool.length];
      cursor++;
      if (item && !chosen.includes(item)) chosen.push(item);
    }
    result.push(reviewDay(day, chosen, byId, "Review: "));
  }

  result[days - 1] = reviewDay(
    days,
    items.slice(0, Math.min(3, items.length)),
    byId,
    "Final run-through: ",
  );
  return result;
}

export function buildSchedule(input: {
  questions: readonly Question[];
  requirements: readonly Requirement[];
  days: number;
}): Schedule {
  const { days } = input;
  if (!Number.isInteger(days) || days < 1) {
    throw new RangeError(`days must be a positive integer, got ${days}`);
  }

  const byId: RequirementsById = new Map(input.requirements.map((r) => [r.id, r]));
  const items = prioritise(input.questions, byId);

  if (items.length === 0) {
    return {
      days_available: days,
      days: Array.from({ length: days }, (_, i) => ({
        day: i + 1,
        focus: "No questions yet. Add or generate some for this kit.",
        question_ids: [],
        minutes: 0,
      })),
    };
  }

  if (items.length >= days) {
    return {
      days_available: days,
      days: chunkByMinutes(items, days).map((chunk, i) => studyDay(i + 1, chunk, byId)),
    };
  }
  return { days_available: days, days: spreadWithReview(items, days, byId) };
}
