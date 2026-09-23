import { z } from "zod";

const CATEGORY = z.enum(["technical", "behavioural", "system-design", "company-fit"]);

export const updateQuestionSchema = z.object({
  params: z.object({ id: z.string().min(1), questionId: z.string().min(1) }),
  body: z.object({
    prompt: z.string().min(1).optional(),
    answer_outline: z.string().optional(),
    category: CATEGORY.optional(),
    difficulty: z.coerce.number().int().min(1).max(3).optional(),
    requirement_ids: z.array(z.string()).optional(),
  }),
});

export const deleteQuestionSchema = z.object({
  params: z.object({ id: z.string().min(1), questionId: z.string().min(1) }),
});

export const addQuestionSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    category: CATEGORY,
    prompt: z.string().min(1),
    answer_outline: z.string().default(""),
    difficulty: z.coerce.number().int().min(1).max(3).default(2),
    requirement_ids: z.array(z.string()).default([]),
  }),
});

export const reorderQuestionsSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ question_ids: z.array(z.string()).min(1) }),
});

export const updateFlashcardSchema = z.object({
  params: z.object({ id: z.string().min(1), flashcardId: z.string().min(1) }),
  body: z.object({
    front: z.string().min(1).optional(),
    back: z.string().min(1).optional(),
    requirement_ids: z.array(z.string()).optional(),
  }),
});

export const deleteFlashcardSchema = z.object({
  params: z.object({ id: z.string().min(1), flashcardId: z.string().min(1) }),
});

export const addFlashcardSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    front: z.string().min(1),
    back: z.string().min(1),
    requirement_ids: z.array(z.string()).default([]),
  }),
});

export const practiceFlashcardSchema = z.object({
  params: z.object({ id: z.string().min(1), flashcardId: z.string().min(1) }),
  body: z.object({ confidence: z.coerce.number().int().min(1).max(5) }),
});
