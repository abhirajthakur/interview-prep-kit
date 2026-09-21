import { z } from "zod";
import type { Question, Requirement } from "../kit.schema.js";
import type { JsonLlm } from "../llm/port.js";
import type { HiringSignals } from "../research/hiring-signals.js";
import { fenceUntrusted, UNTRUSTED_NOTICE } from "../security/untrusted.js";
import { normalizeForMatch } from "../text/normalize.js";

export type QuestionCategory = Question["category"];
export type DraftQuestion = Omit<Question, "id">;

export type GenerationContext = {
  roleTitle: string;
  seniority: string;
  companyName: string;
  /** Short factual statements about the company taken from its own pages. Empty when nothing was found. */
  companyFacts: string[];
  signals: HiringSignals;
};

export type GenerateArgs = {
  category: QuestionCategory;
  requirements: readonly Requirement[];
  context: GenerationContext;
  existingPrompts?: readonly string[];
  /** True when these requirements currently have no question. */
  gapFill?: boolean;
};

const REQUIREMENTS_PER_CALL = 6;
const MIN_PROMPT_CHARS = 10;
const MAX_PROMPT_CHARS = 400;
const MAX_OUTLINE_CHARS = 600;

const outputSchema = z.object({
  questions: z.array(
    z.object({
      requirement_ids: z.array(z.string()),
      prompt: z.string(),
      answer_outline: z.string(),
      difficulty: z.number(),
    }),
  ),
});

const CATEGORY_INSTRUCTIONS: Record<QuestionCategory, string> = {
  technical:
    "Write technical interview questions. For each requirement, write at least one concrete question that tests real depth: a scenario, a trade-off or a debugging situation, not trivia or definitions. Ask about decisions the candidate would make, not facts they could look up.",
  behavioural:
    "Write behavioural interview questions of the form 'Tell me about a time when...'. Each should draw out a real past experience of collaboration, mentoring, ownership or communication that matches the requirement. The answer outline says what a strong story would show.",
  "system-design":
    "Write system design questions. Each is an open-ended design problem relevant to the requirements, with a scale or constraint the candidate must reason about. The outline lists the components, trade-offs and follow-up questions a strong answer covers. Reference only requirement ids from the list.",
  "company-fit":
    "Write questions about motivation, values and working style for this specific company. Use only the company facts provided; never state facts about the company that are not listed. If no facts are provided, write general questions about why the candidate wants this kind of role and team, without claiming anything about the company.",
};

const COMMON_RULES = `Rules:
- "prompt": the question exactly as an interviewer would say it, at most 60 words.
- "answer_outline": 3 to 5 key points of a strong answer, separated by semicolons.
- "difficulty": 1 (warm-up), 2 (standard) or 3 (hard). Match it to the seniority of the role.
- "requirement_ids": only ids from the provided list. Leave it empty for company-fit questions.
- No duplicate questions.`;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function questionCountRange(
  category: QuestionCategory,
  requirementCount: number,
): [number, number] {
  if (category === "system-design") return [2, 3];
  if (category === "company-fit") return [1, 3];
  return [requirementCount, Math.min(requirementCount * 2, 10)];
}

function describeProcess(signals: HiringSignals): string {
  if (!signals.found) return "";
  const parts: string[] = [];
  if (signals.stages.length > 0)
    parts.push(`Stages: ${signals.stages.map((s) => `${s.name} (${s.description})`).join(" | ")}`);
  if (signals.takeHome) parts.push("Includes a take-home task.");
  if (signals.systemDesign) parts.push("Includes a system design or architecture discussion.");
  if (signals.liveCoding) parts.push("Includes live coding or pair programming.");
  return parts.join("\n");
}

function buildUserMessage(
  args: GenerateArgs,
  batch: readonly Requirement[],
  range: [number, number],
): string {
  const { category, context } = args;
  const level = context.seniority || "unspecified-level";
  const parts = [
    `Role: ${level} ${context.roleTitle || "role"}${context.companyName ? ` at ${context.companyName}` : ""}.`,
  ];

  if (batch.length > 0) {
    parts.push(
      "Requirements to cover (use these ids in requirement_ids):\n" +
        fenceUntrusted(
          "requirements",
          batch.map((r) => `${r.id} [${r.priority}] ${r.text}`).join("\n"),
        ),
    );
  }
  if (args.gapFill)
    parts.push(
      "These requirements currently have no question. Make sure each one gets at least one.",
    );

  if (category === "company-fit") {
    parts.push(
      context.companyFacts.length > 0
        ? "Company facts:\n" +
            fenceUntrusted("company_facts", context.companyFacts.map((f) => `- ${f}`).join("\n"))
        : "No facts about the company are available.",
    );
  } else {
    const process = describeProcess(context.signals);
    if (process) {
      parts.push(
        "How the company interviews (from its own pages). If it names a format, make some questions rehearse that format:\n" +
          fenceUntrusted("hiring_process", process),
      );
    }
  }

  parts.push(`Write between ${range[0]} and ${range[1]} questions.`);
  return parts.join("\n\n");
}

/** Generates questions for one category. Ids are assigned later; unknown requirement ids are dropped here. */
export async function generateQuestions(
  llm: JsonLlm,
  args: GenerateArgs,
): Promise<DraftQuestion[]> {
  const { category } = args;
  const batches =
    category === "company-fit" ? [[]] : chunk(args.requirements, REQUIREMENTS_PER_CALL);
  const seen = new Set((args.existingPrompts ?? []).map(normalizeForMatch));
  const drafts: DraftQuestion[] = [];

  for (const batch of batches) {
    const range = questionCountRange(category, batch.length);
    const raw = await llm.completeJson({
      system: `You write interview questions for candidates preparing for a specific job.\n${UNTRUSTED_NOTICE}\n\n${CATEGORY_INSTRUCTIONS[category]}\n\n${COMMON_RULES}`,
      user: buildUserMessage(args, batch, range),
      schema: outputSchema,
      schemaName: `questions_${category.replace("-", "_")}`,
      maxTokens: 2500,
    });

    const allowed = new Set(batch.map((r) => r.id));
    let accepted = 0;
    for (const q of raw.questions) {
      if (accepted >= range[1]) break;

      const requirementIds = [...new Set(q.requirement_ids.filter((id) => allowed.has(id)))];
      if (category !== "company-fit" && requirementIds.length === 0) continue; // unsupported question

      const prompt = q.prompt.trim().slice(0, MAX_PROMPT_CHARS);
      const key = normalizeForMatch(prompt);
      if (prompt.length < MIN_PROMPT_CHARS || seen.has(key)) continue;
      seen.add(key);

      drafts.push({
        requirement_ids: requirementIds,
        category,
        prompt,
        answer_outline: q.answer_outline.trim().slice(0, MAX_OUTLINE_CHARS),
        difficulty: Math.min(3, Math.max(1, Math.round(q.difficulty))),
      });
      accepted++;
    }
  }
  return drafts;
}
