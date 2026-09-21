import { z } from "zod";
import type { Flashcard, Requirement } from "../kit.schema.js";
import type { JsonLlm } from "../llm/port.js";
import { fenceUntrusted, UNTRUSTED_NOTICE } from "../security/untrusted.js";
import { normalizeForMatch } from "../text/normalize.js";

export type DraftFlashcard = Omit<Flashcard, "id">;

const REQUIREMENTS_PER_CALL = 10;
const MAX_FRONT_CHARS = 200;
const MAX_BACK_CHARS = 500;
const MIN_TEXT_CHARS = 5;

const outputSchema = z.object({
  flashcards: z.array(
    z.object({
      requirement_ids: z.array(z.string()),
      front: z.string(),
      back: z.string(),
    }),
  ),
});

const SYSTEM_PROMPT = `You write flashcards for someone revising for a job interview.
${UNTRUSTED_NOTICE}

Rules:
- Each card tests one fact, concept, trade-off or rule of thumb the candidate should be able to recall quickly. It is not an interview question.
- "front": a short question or prompt, at most 25 words.
- "back": the answer in 1 to 3 short sentences.
- For behavioural requirements, the card asks what a strong example story should show, and the back lists the key points.
- Write at least one card per requirement and at most two. "requirement_ids" holds the ids from the list.
- Do not make claims about the employer.`;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function generateFlashcards(
  llm: JsonLlm,
  args: { requirements: readonly Requirement[]; roleTitle: string; seniority: string },
): Promise<DraftFlashcard[]> {
  const cards: DraftFlashcard[] = [];
  const seen = new Set<string>();

  for (const batch of chunk(args.requirements, REQUIREMENTS_PER_CALL)) {
    const raw = await llm.completeJson({
      system: SYSTEM_PROMPT,
      user:
        `Role: ${args.seniority || "unspecified-level"} ${args.roleTitle || "role"}.\n\n` +
        `Requirements (use these ids in requirement_ids):\n` +
        fenceUntrusted(
          "requirements",
          batch.map((r) => `${r.id} [${r.kind}] ${r.text}`).join("\n"),
        ),
      schema: outputSchema,
      schemaName: "flashcards",
      maxTokens: 1800,
    });

    const allowed = new Set(batch.map((r) => r.id));
    for (const card of raw.flashcards) {
      const ids = [...new Set(card.requirement_ids.filter((id) => allowed.has(id)))];
      const front = card.front.trim().slice(0, MAX_FRONT_CHARS);
      const back = card.back.trim().slice(0, MAX_BACK_CHARS);
      if (ids.length === 0 || front.length < MIN_TEXT_CHARS || back.length < MIN_TEXT_CHARS)
        continue;

      const key = normalizeForMatch(front);
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push({ front, back, requirement_ids: ids, origin: "generated" });
    }
  }
  return cards;
}
