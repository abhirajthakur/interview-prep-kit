import app from "./app.js";
import env from "./config/env.js";
import { logger } from "./lib/logger.js";

const server = app.listen(env.PORT, () => {
  logger.info(`Hotel service started on port ${env.PORT}`);
});

const shutdown = (signal: string) => {
  logger.info(`${signal} received. Shutting down...`);

  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
