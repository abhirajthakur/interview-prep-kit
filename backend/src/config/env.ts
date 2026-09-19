import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z
    .string()
    .refine((val) => val.startsWith("postgres://") || val.startsWith("postgresql://"), {
      message: "DATABASE_URL must be a postgres connection string",
    }),

  CORS_ORIGIN: z.url().default("http://localhost:5173"),
});

const env = envSchema.parse(process.env);

export default env;
