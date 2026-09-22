import app from "./app.js";
import env from "./config/env.js";
import { connectDb, disconnectDb } from "./db/connection.js";
import { logger } from "./lib/logger.js";
import { initPipelineServices } from "./lib/pipeline.js";

async function main() {
  initPipelineServices();

  // Don't start the server if DB connection fails
  try {
    await connectDb();
  } catch {
    logger.error("Not able to connect to DB.");
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => {
    logger.info(`API listening on port ${env.PORT}`);
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received. Shutting down...`);

    server.close(() => {
      void disconnectDb().finally(() => {
        logger.info("Shutdown complete");
        process.exit(0);
      });
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch(() => {
  logger.error("Failed to start server.");
  process.exit(1);
});
