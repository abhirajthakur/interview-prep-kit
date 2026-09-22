import mongoose from "mongoose";
import env from "../config/env.js";
import { logger } from "../lib/logger.js";

export async function connectDb() {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10_000,
    });

    logger.info("MongoDB connected");
  } catch {
    throw new Error("Not able to connect to DB.");
  }
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
