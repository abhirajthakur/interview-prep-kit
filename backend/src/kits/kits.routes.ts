import { Router } from "express";
import { requireAuth } from "../middlewares/require-auth.js";
import { validate } from "../middlewares/validate.js";
import { asyncHandler } from "../utils/async-handler.js";
import { create, get, list, regenerate } from "./kits.controller.js";
import { createKitSchema, getKitParamsSchema, regenerateKitSchema } from "./kits.schemas.js";

const router = Router();

router.use(requireAuth);

router.post("/", validate(createKitSchema), asyncHandler(create));
router.get("/", asyncHandler(list));
router.get("/:id", validate(getKitParamsSchema), asyncHandler(get));
router.post("/:id/regenerate", validate(regenerateKitSchema), asyncHandler(regenerate));

export default router;
