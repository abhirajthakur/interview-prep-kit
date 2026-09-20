import mongoose from "mongoose";
import env from "../config/env.js";
import { logger } from "../lib/logger.js";

export async function connectDb() {
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  logger.info("MongoDB connected");
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
