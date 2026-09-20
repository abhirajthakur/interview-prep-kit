import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  MONGODB_URI: z
    .string()
    .refine((v) => v.startsWith("mongodb://") || v.startsWith("mongodb+srv://"), {
      message: "MONGODB_URI must be a MongoDB connection string",
    }),

  CORS_ORIGIN: z.url().default("http://localhost:3000"),
});

const env = envSchema.parse(process.env);

export default env;
