import type { Requirement } from "../kit.schema.js";
import type { DraftQuestion } from "./question-generator.js";

/**
 * Deterministic last resort so a must-have never ships without a question. These are honest but generic:
 * the kit records that they were templated.
 */
export function fallbackQuestion(requirement: Requirement): DraftQuestion {
  const text = requirement.text;

  if (requirement.kind === "behavioural") {
    return {
      requirement_ids: [requirement.id],
      category: "behavioural",
      prompt: `Tell me about a time that shows this in practice: ${text}. What was the situation, what did you do, and what was the result?`,
      answer_outline:
        "Set the scene briefly; say what you personally did; give a measurable result; reflect on what you would change.",
      difficulty: 2,
    };
  }

  return {
    requirement_ids: [requirement.id],
    category: "technical",
    prompt:
      requirement.kind === "domain"
        ? `What do you know about ${text}? Explain the key concepts and how they would affect your work in this role.`
        : `Walk me through your hands-on experience with: ${text}. Describe a real project, the decisions you made and why, and what went wrong.`,
    answer_outline:
      "Give a concrete example; explain trade-offs you considered; mention a failure and what you learned; connect it to this role.",
    difficulty: 2,
  };
}
