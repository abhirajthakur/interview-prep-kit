import { Router } from "express";
import { requireAuth } from "../middlewares/require-auth.js";
import { validate } from "../middlewares/validate.js";
import { asyncHandler } from "../utils/async-handler.js";
import * as itemsController from "./kits-items.controller.js";
import {
  addFlashcardSchema,
  addQuestionSchema,
  deleteFlashcardSchema,
  deleteQuestionSchema,
  practiceFlashcardSchema,
  reorderQuestionsSchema,
  updateFlashcardSchema,
  updateQuestionSchema,
} from "./kits-items.schemas.js";
import { create, get, list, regenerate } from "./kits.controller.js";
import { createKitSchema, getKitParamsSchema, regenerateKitSchema } from "./kits.schemas.js";

const router = Router();

router.use(requireAuth);

router.post("/", validate(createKitSchema), asyncHandler(create));
router.get("/", asyncHandler(list));
router.get("/:id", validate(getKitParamsSchema), asyncHandler(get));
router.post("/:id/regenerate", validate(regenerateKitSchema), asyncHandler(regenerate));

// "order" must be registered before "/:questionId" — Express matches routes in registration order.
router.patch(
  "/:id/questions/order",
  validate(reorderQuestionsSchema),
  asyncHandler(itemsController.reorderQuestions),
);
router.post(
  "/:id/questions",
  validate(addQuestionSchema),
  asyncHandler(itemsController.addQuestion),
);
router.patch(
  "/:id/questions/:questionId",
  validate(updateQuestionSchema),
  asyncHandler(itemsController.updateQuestion),
);
router.delete(
  "/:id/questions/:questionId",
  validate(deleteQuestionSchema),
  asyncHandler(itemsController.deleteQuestion),
);

router.post(
  "/:id/flashcards",
  validate(addFlashcardSchema),
  asyncHandler(itemsController.addFlashcard),
);
router.patch(
  "/:id/flashcards/:flashcardId/practice",
  validate(practiceFlashcardSchema),
  asyncHandler(itemsController.practiceFlashcard),
);
router.patch(
  "/:id/flashcards/:flashcardId",
  validate(updateFlashcardSchema),
  asyncHandler(itemsController.updateFlashcard),
);
router.delete(
  "/:id/flashcards/:flashcardId",
  validate(deleteFlashcardSchema),
  asyncHandler(itemsController.deleteFlashcard),
);

export default router;
