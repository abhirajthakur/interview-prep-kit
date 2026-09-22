import { Router } from "express";
import authRouter from "../../auth/auth.routes.js";
import kitRouter from "../../kits/kits.routes.js";

const v1Router = Router();

v1Router.use("/auth", authRouter);
v1Router.use("/kits", kitRouter);

export default v1Router;
