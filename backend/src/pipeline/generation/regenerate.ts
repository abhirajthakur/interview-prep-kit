import { findUncovered, onlyMust } from "../coverage/coverage.js";
import { PipelineError } from "../errors.js";
import { fallbackQuestion } from "./fallback-question.js";
import type { Flashcard, Question, Requirement } from "../kit.schema.js";
import { LlmError } from "../llm/errors.js";
import type { JsonLlm } from "../llm/port.js";
import { generateFlashcards, type DraftFlashcard } from "./flashcards.js";
import { MAX_PASSES, planCategories } from "./question-drafting.js";
import {
  generateQuestions,
  type DraftQuestion,
  type GenerationContext,
  type QuestionCategory,
} from "./question-generator.js";

export const nextIdAfter = (ids: readonly string[]): number =>
  1 + Math.max(0, ...ids.map((id) => Number(id.replace(/\D/g, "")) || 0));

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

export type RegenerateQuestionsInput = {
  category: QuestionCategory;
  allRequirements: readonly Requirement[];
  currentQuestions: readonly Question[];
  context: GenerationContext;
  thin: boolean;
};

export type RegenerateQuestionsResult = { questions: Question[]; warnings: string[] };

/**
 * Regenerates one question category. Keeps every question that is pinned, edited, or written by hand
 * (origin "manual"), everywhere in the kit. Only untouched generated questions in the target category
 * are replaced, then the same coverage/gap-fill/fallback guarantee as kit creation runs, scoped to
 * this category's requirement pool.
 */
export async function regenerateQuestionCategory(
  llm: JsonLlm,
  input: RegenerateQuestionsInput,
): Promise<RegenerateQuestionsResult> {
  const plans = planCategories({
    requirements: input.allRequirements,
    seniority: input.context.seniority,
    thin: input.thin,
    signalsMentionDesign: input.context.signals.systemDesign,
  });
  const plan = plans.find((p) => p.category === input.category);
  if (!plan)
    throw new PipelineError(`"${input.category}" does not apply to this kit.`, "INVALID_INPUT");

  const otherQuestions = input.currentQuestions.filter((q) => q.category !== input.category);
  const keptInCategory = input.currentQuestions.filter(
    (q) =>
      q.category === input.category &&
      (q.pinned === true || q.edited === true || q.origin === "manual"),
  );

  let nextId = nextIdAfter(input.currentQuestions.map((q) => q.id));
  const assignIds = (drafts: readonly DraftQuestion[]): Question[] =>
    drafts.map((d) => ({ ...d, id: `q${nextId++}`, origin: "generated" as const }));

  let all: Question[] = [...otherQuestions, ...keptInCategory];
  const warnings: string[] = [];

  const generate = async (
    requirements: readonly Requirement[],
    gapFill: boolean,
  ): Promise<void> => {
    try {
      const drafts = await generateQuestions(llm, {
        category: input.category,
        requirements,
        context: input.context,
        existingPrompts: all.map((q) => q.prompt),
        gapFill,
      });
      all = [...all, ...assignIds(drafts)];
    } catch (e) {
      if (e instanceof LlmError && e.code === "LLM_INVALID_OUTPUT") {
        warnings.push(
          `The model returned unusable output while regenerating ${input.category} questions.`,
        );
        return;
      }
      throw e;
    }
  };

  await generate(plan.requirements, false);

  let previousGaps: string[] | null = null;
  for (let pass = 1; pass < MAX_PASSES; pass++) {
    const gaps = findUncovered(plan.requirements, all);
    if (gaps.length === 0) break;
    if (previousGaps && sameIds(previousGaps, gaps)) break;
    previousGaps = gaps;
    await generate(
      plan.requirements.filter((r) => gaps.includes(r.id)),
      true,
    );
  }

  const mustGaps = onlyMust(plan.requirements, findUncovered(plan.requirements, all));
  for (const id of mustGaps) {
    const requirement = plan.requirements.find((r) => r.id === id);
    if (requirement) all = [...all, ...assignIds([fallbackQuestion(requirement)])];
  }
  if (mustGaps.length > 0) {
    warnings.push(
      `${mustGaps.length} must-have requirement(s) needed a template question after regeneration.`,
    );
  }

  return { questions: all, warnings };
}

export type RegenerateFlashcardsInput = {
  requirements: readonly Requirement[];
  currentFlashcards: readonly Flashcard[];
  roleTitle: string;
  seniority: string;
};

/** Keeps pinned/edited/manual cards; generates fresh ones only for requirements no kept card covers. */
export async function regenerateFlashcards(
  llm: JsonLlm,
  input: RegenerateFlashcardsInput,
): Promise<Flashcard[]> {
  const kept = input.currentFlashcards.filter(
    (f) => f.pinned === true || f.edited === true || f.origin === "manual",
  );
  const coveredIds = new Set(kept.flatMap((f) => f.requirement_ids));
  const needing = input.requirements.filter((r) => !coveredIds.has(r.id));
  if (needing.length === 0) return [...kept];

  const drafts: DraftFlashcard[] = await generateFlashcards(llm, {
    requirements: needing,
    roleTitle: input.roleTitle,
    seniority: input.seniority,
  });
  let nextId = nextIdAfter(input.currentFlashcards.map((f) => f.id));
  return [...kept, ...drafts.map((d) => ({ ...d, id: `f${nextId++}` }))];
}
