import app from "./app.js";
import env from "./config/env.js";
import { connectDb, disconnectDb } from "./db/connection.js";
import { logger } from "./lib/logger.js";

async function main() {
  await connectDb();

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

main().catch((error: unknown) => {
  logger.error(`Failed to start: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
