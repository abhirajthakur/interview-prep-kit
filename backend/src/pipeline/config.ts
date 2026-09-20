import { z } from "zod";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const envSchema = z.object({
  GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY is required (see backend/.env.example)"),
  LLM_MODEL: z.preprocess(emptyToUndefined, z.string().default("openai/gpt-oss-120b")),
  ALLOW_PRIVATE_HOSTS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type PipelineConfig = {
  apiKey: string;
  model: string;
  allowPrivateHosts: boolean;
};

export function loadPipelineConfig(env: NodeJS.ProcessEnv = process.env): PipelineConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  return {
    apiKey: parsed.data.GROQ_API_KEY,
    model: parsed.data.LLM_MODEL,
    allowPrivateHosts: parsed.data.ALLOW_PRIVATE_HOSTS,
  };
}
