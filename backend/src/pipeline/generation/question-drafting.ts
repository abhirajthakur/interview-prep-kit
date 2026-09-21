import { findUncovered, onlyMust } from "../coverage/coverage.js";
import type { Question, Requirement } from "../kit.schema.js";
import { LlmError } from "../llm/errors.js";
import type { JsonLlm } from "../llm/port.js";
import { fallbackQuestion } from "./fallback-question.js";
import {
  generateQuestions,
  type DraftQuestion,
  type GenerationContext,
  type QuestionCategory,
} from "./question-generator.js";

// Pass 1 is the initial draft; each further pass targets only what is still uncovered
export const MAX_PASSES = 3;
const MAX_SYSTEM_DESIGN_REQUIREMENTS = 5;

export type QuestionPlan = { category: QuestionCategory; requirements: Requirement[] };

export type DraftInput = {
  requirements: readonly Requirement[];
  context: GenerationContext;
  // True when the posting is too thin to support a full kit
  thin: boolean;
};

export type DraftResult = {
  questions: Question[];
  passes: number;
  uncoveredIds: string[];
  fallbackRequirementIds: string[];
  warnings: string[];
};

const isSeniorEnoughForDesign = (seniority: string): boolean => {
  return seniority.trim() !== "" && !/junior|intern|entry|graduate/i.test(seniority);
};

// Which categories to generate. Each category is a separate call with its own instructions
export function planCategories(args: {
  requirements: readonly Requirement[];
  seniority: string;
  thin: boolean;
  signalsMentionDesign: boolean;
}): QuestionPlan[] {
  const technical = args.requirements.filter((r) => r.kind !== "behavioural");
  const behavioural = args.requirements.filter((r) => r.kind === "behavioural");
  const plans: QuestionPlan[] = [];

  if (technical.length > 0) plans.push({ category: "technical", requirements: technical });
  if (behavioural.length > 0) plans.push({ category: "behavioural", requirements: behavioural });

  const wantsDesign =
    args.signalsMentionDesign || (!args.thin && isSeniorEnoughForDesign(args.seniority));
  if (technical.length > 0 && wantsDesign) {
    const mustFirst = [
      ...technical.filter((r) => r.priority === "must"),
      ...technical.filter((r) => r.priority === "nice"),
    ];
    plans.push({
      category: "system-design",
      requirements: mustFirst.slice(0, MAX_SYSTEM_DESIGN_REQUIREMENTS),
    });
  }

  plans.push({ category: "company-fit", requirements: [] });
  return plans;
}

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * Draft, check coverage, fill gaps, check again. Stops when everything is covered, when a pass makes no
 * progress, or after MAX_PASSES. Anything must-have that is still uncovered gets a template question.
 */
export async function draftQuestions(llm: JsonLlm, input: DraftInput): Promise<DraftResult> {
  const { requirements, context } = input;
  const warnings: string[] = [];
  const questions: Question[] = [];

  const add = (drafts: readonly DraftQuestion[]): void => {
    for (const draft of drafts)
      questions.push({ ...draft, id: `q${questions.length + 1}`, origin: "generated" });
  };

  const generate = async (
    category: QuestionCategory,
    reqs: readonly Requirement[],
    gapFill: boolean,
  ): Promise<void> => {
    try {
      add(
        await generateQuestions(llm, {
          category,
          requirements: reqs,
          context,
          existingPrompts: questions.map((q) => q.prompt),
          gapFill,
        }),
      );
    } catch (e) {
      // Unusable model output for one category is recoverable: the gap loop below retries what is missing.
      if (e instanceof LlmError && e.code === "LLM_INVALID_OUTPUT") {
        warnings.push(
          `The model returned unusable output for ${category} questions; the coverage check filled the gaps.`,
        );
        return;
      }
      throw e;
    }
  };

  // Pass 1: the first draft, one call per category.
  const plans = planCategories({
    requirements,
    seniority: context.seniority,
    thin: input.thin,
    signalsMentionDesign: context.signals.systemDesign,
  });
  for (const plan of plans) await generate(plan.category, plan.requirements, false);
  let passes = 1;

  // Passes 2..MAX_PASSES: target only the requirements that still have no question.
  let previousGaps: string[] | null = null;
  while (passes < MAX_PASSES) {
    const gaps = findUncovered(requirements, questions);
    if (gaps.length === 0) break;
    if (previousGaps && sameIds(previousGaps, gaps)) break; // the last pass made no progress
    previousGaps = gaps;

    const gapRequirements = requirements.filter((r) => gaps.includes(r.id));
    const technical = gapRequirements.filter((r) => r.kind !== "behavioural");
    const behavioural = gapRequirements.filter((r) => r.kind === "behavioural");
    if (technical.length > 0) await generate("technical", technical, true);
    if (behavioural.length > 0) await generate("behavioural", behavioural, true);
    passes++;
  }

  // Guarantee: no must-have ships uncovered.
  const mustGaps = onlyMust(requirements, findUncovered(requirements, questions));
  for (const id of mustGaps) {
    const requirement = requirements.find((r) => r.id === id);
    if (requirement) add([fallbackQuestion(requirement)]);
  }
  if (mustGaps.length > 0) {
    warnings.push(
      `${mustGaps.length} must-have requirement${mustGaps.length === 1 ? "" : "s"} (${mustGaps.join(", ")}) could not be covered by the model after ${passes} passes, so template questions were added.`,
    );
  }

  const uncoveredIds = findUncovered(requirements, questions);
  if (uncoveredIds.length > 0) {
    warnings.push(
      `${uncoveredIds.length} nice-to-have requirement${uncoveredIds.length === 1 ? " has" : "s have"} no question.`,
    );
  }

  return { questions, passes, uncoveredIds, fallbackRequirementIds: mustGaps, warnings };
}
