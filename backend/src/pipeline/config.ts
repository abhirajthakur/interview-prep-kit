import { z } from "zod";

const boolFlag = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const schema = z.object({
  LLM_PROVIDER: z.enum(["groq", "gemini"]).default("groq"),
  GROQ_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  LLM_MODEL_HEAVY: z.string().default("openai/gpt-oss-120b"),
  LLM_MODEL_LIGHT: z.string().default("openai/gpt-oss-20b"),
  LLM_MODEL_ALT: z.string().default("qwen/qwen3.8-27b"),
  LLM_DEV_CACHE: boolFlag,
  ALLOW_PRIVATE_HOSTS: boolFlag,
});

export type PipelineConfig = z.infer<typeof schema>;

export function loadPipelineConfig(env: NodeJS.ProcessEnv = process.env): PipelineConfig {
  const cfg = schema.parse(env);
  const keyName = cfg.LLM_PROVIDER === "groq" ? "GROQ_API_KEY" : "GEMINI_API_KEY";
  if (!cfg[keyName]) {
    throw new Error(
      `${keyName} is required when LLM_PROVIDER=${cfg.LLM_PROVIDER}. See .env.example.`,
    );
  }
  return cfg;
}
