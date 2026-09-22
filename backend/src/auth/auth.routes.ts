import { Router } from "express";
import { requireAuth } from "../middlewares/require-auth.js";
import { validate } from "../middlewares/validate.js";
import { asyncHandler } from "../utils/async-handler.js";
import { login, logout, me, register } from "./auth.controller.js";
import { loginSchema, registerSchema } from "./auth.schemas.js";

const router = Router();

router.post("/register", validate(registerSchema), asyncHandler(register));
router.post("/login", validate(loginSchema), asyncHandler(login));
router.post("/logout", requireAuth, asyncHandler(logout));
router.get("/me", requireAuth, (req, res) => me(req, res));

export default router;
