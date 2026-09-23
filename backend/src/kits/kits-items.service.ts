import { KitModel, type KitDoc } from "../db/models/kit.model.js";
import { nextIdAfter } from "../pipeline/generation/regenerate.js";
import type { Flashcard, Question } from "../pipeline/kit.schema.js";
import { badRequest, conflict, notFound } from "../utils/api-error.js";

async function getReadyKit(kitId: string, ownerId: string): Promise<KitDoc> {
  const kit = await KitModel.findOne({ _id: kitId, ownerId });
  if (!kit) throw notFound("Kit not found");
  if (kit.status !== "ready") throw conflict("This kit is still generating.");
  return kit;
}

export type QuestionPatch = Partial<
  Pick<Question, "prompt" | "answer_outline" | "category" | "difficulty" | "requirement_ids">
>;

export async function updateQuestion(
  kitId: string,
  ownerId: string,
  questionId: string,
  patch: QuestionPatch,
): Promise<KitDoc> {
  const kit = await getReadyKit(kitId, ownerId);
  const q = kit.questions.find((x) => x.id === questionId);
  if (!q) throw notFound("Question not found");
  Object.assign(q, patch);
  if (q.origin !== "manual") q.edited = true;
  kit.version += 1;
  await kit.save();
  return kit;
}

export async function deleteQuestion(
  kitId: string,
  ownerId: string,
  questionId: string,
): Promise<KitDoc> {
  const kit = await getReadyKit(kitId, ownerId);
  const before = kit.questions.length;
  kit.set(
    "questions",
    kit.questions.filter((x) => x.id !== questionId),
  );
  if (kit.questions.length === before) throw notFound("Question not found");

  kit.schedule?.days.forEach((d) =>
    d.set(
      "question_ids",
      d.question_ids.filter((id) => id !== questionId),
    ),
  );
  kit.version += 1;
  await kit.save();
  return kit;
}

export type NewQuestionInput = {
  category: Question["category"];
  prompt: string;
  answer_outline: string;
  difficulty: number;
  requirement_ids: string[];
};

export async function addQuestion(
  kitId: string,
  ownerId: string,
  input: NewQuestionInput,
): Promise<KitDoc> {
  const kit = await getReadyKit(kitId, ownerId);
  const ids: string[] = kit.questions.map((q) => q.id).filter((id): id is string => id != null);
  const id = `q${nextIdAfter(ids)}`;

  kit.questions.push({ id, origin: "manual", edited: false, pinned: false, ...input });
  kit.version += 1;
  await kit.save();
  return kit;
}

export async function reorderQuestions(
  kitId: string,
  ownerId: string,
  orderedIds: string[],
): Promise<KitDoc> {
  const kit = await getReadyKit(kitId, ownerId);
  const byId = new Map(kit.questions.map((q) => [q.id, q]));
  if (orderedIds.length !== byId.size || orderedIds.some((id) => !byId.has(id))) {
    throw badRequest("question_ids must be exactly the kit's current question ids, reordered.");
  }
  kit.set(
    "questions",
    orderedIds.map((id) => byId.get(id)),
  );
  kit.version += 1;
  await kit.save();
  return kit;
}

export type FlashcardPatch = Partial<Pick<Flashcard, "front" | "back" | "requirement_ids">>;

export async function updateFlashcard(
  kitId: string,
  ownerId: string,
  flashcardId: string,
  patch: FlashcardPatch,
): Promise<KitDoc> {
  const kit = await getReadyKit(kitId, ownerId);
  const f = kit.flashcards.find((x) => x.id === flashcardId);
  if (!f) throw notFound("Flashcard not found");
  Object.assign(f, patch);
  if (f.origin !== "manual") f.edited = true;
  kit.version += 1;
  await kit.save();
  return kit;
}

export async function deleteFlashcard(
  kitId: string,
  ownerId: string,
  flashcardId: string,
): Promise<KitDoc> {
  const kit = await getReadyKit(kitId, ownerId);
  const before = kit.flashcards.length;
  kit.set(
    "flashcards",
    kit.flashcards.filter((x) => x.id !== flashcardId),
  );
  if (kit.flashcards.length === before) throw notFound("Flashcard not found");
  kit.version += 1;
  await kit.save();
  return kit;
}

export type NewFlashcardInput = { front: string; back: string; requirement_ids: string[] };

export async function addFlashcard(
  kitId: string,
  ownerId: string,
  input: NewFlashcardInput,
): Promise<KitDoc> {
  const kit = await getReadyKit(kitId, ownerId);
  const ids: string[] = kit.questions.map((q) => q.id).filter((id): id is string => id != null);
  const id = `q${nextIdAfter(ids)}`;

  kit.flashcards.push({ id, origin: "manual", edited: false, pinned: false, ...input });
  kit.version += 1;
  await kit.save();
  return kit;
}

/** Atomic update, no version bump: practice progress shouldn't fight with a regeneration's optimistic lock. */
export async function setFlashcardConfidence(
  kitId: string,
  ownerId: string,
  flashcardId: string,
  confidence: number,
): Promise<KitDoc> {
  const updated = await KitModel.findOneAndUpdate(
    { _id: kitId, ownerId, status: "ready", "flashcards.id": flashcardId },
    { $set: { "flashcards.$.confidence": confidence, "flashcards.$.lastPracticedAt": new Date() } },
    { new: true },
  );
  if (!updated) throw notFound("Kit or flashcard not found");
  return updated;
}
