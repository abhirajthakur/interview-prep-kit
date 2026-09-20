import "dotenv/config";
import { z } from "zod";
import { loadPipelineConfig } from "../pipeline/config.js";
import { LlmClient } from "../pipeline/llm/client.js";

async function main() {
  const config = loadPipelineConfig();
  const client = new LlmClient({
    config,
    logger: { debug() {}, info: console.log, warn: console.warn, error: console.error },
  });

  const t0 = Date.now();
  const out = await client.completeJson({
    system: "You reply with JSON.",
    user: 'Return {"answer":"pong"}.',
    schema: z.object({ answer: z.string() }),
    schemaName: "smoke",
    maxTokens: 300,
  });

  console.log(`OK ${config.model} ${Date.now() - t0}ms`, out);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
