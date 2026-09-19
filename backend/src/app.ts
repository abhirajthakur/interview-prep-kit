import cors from "cors";
import express from "express";
import env from "./config/env.js";
import { correlationId } from "./middlewares/correlation-id.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { routeNotFound } from "./middlewares/route-not-found.js";
import v1Router from "./routers/v1/index.router.js";

const app: express.Application = express();

app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

app.use(correlationId);
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/v1", v1Router);

app.use(routeNotFound);
app.use(errorHandler);

export default app;
