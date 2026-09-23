import type { Request, Response } from "express";
import { unauthorized } from "../utils/api-error.js";
import { sendSuccess } from "../utils/api-response.js";
import * as items from "./kits-items.service.js";

function ownerId(req: Request): string {
  if (!req.user) throw unauthorized("Sign in required.");
  return req.user.id;
}
const p = (req: Request, key: string): string => req.params[key] as string;

export async function updateQuestion(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    200,
    await items.updateQuestion(
      p(req, "id"),
      ownerId(req),
      p(req, "questionId"),
      req.body as items.QuestionPatch,
    ),
  );
}
export async function deleteQuestion(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    200,
    await items.deleteQuestion(p(req, "id"), ownerId(req), p(req, "questionId")),
  );
}
export async function addQuestion(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    201,
    await items.addQuestion(p(req, "id"), ownerId(req), req.body as items.NewQuestionInput),
  );
}
export async function reorderQuestions(req: Request, res: Response): Promise<void> {
  const { question_ids } = req.body as { question_ids: string[] };
  sendSuccess(res, 200, await items.reorderQuestions(p(req, "id"), ownerId(req), question_ids));
}
export async function updateFlashcard(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    200,
    await items.updateFlashcard(
      p(req, "id"),
      ownerId(req),
      p(req, "flashcardId"),
      req.body as items.FlashcardPatch,
    ),
  );
}
export async function deleteFlashcard(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    200,
    await items.deleteFlashcard(p(req, "id"), ownerId(req), p(req, "flashcardId")),
  );
}
export async function addFlashcard(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    201,
    await items.addFlashcard(p(req, "id"), ownerId(req), req.body as items.NewFlashcardInput),
  );
}
export async function practiceFlashcard(req: Request, res: Response): Promise<void> {
  const { confidence } = req.body as { confidence: number };
  sendSuccess(
    res,
    200,
    await items.setFlashcardConfidence(
      p(req, "id"),
      ownerId(req),
      p(req, "flashcardId"),
      confidence,
    ),
  );
}
