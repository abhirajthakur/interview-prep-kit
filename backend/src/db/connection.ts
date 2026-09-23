import mongoose from "mongoose";
import env from "../config/env.js";
import { logger } from "../lib/logger.js";

export async function connectDb() {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10_000,
    });

    logger.info("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    logger.error("Not able to connect to DB.", {
      error: error instanceof Error ? error.message : String(error),
    });

    process.exit(1);
  }
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
