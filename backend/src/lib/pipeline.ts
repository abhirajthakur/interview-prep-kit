import { loadPipelineConfig } from "../pipeline/config.js";
import { LlmClient } from "../pipeline/llm/client.js";
import { createSafeFetcher, type Fetcher } from "../pipeline/retrieval/safe-fetch.js";
import { logger } from "../lib/logger.js";

type PipelineServices = { llm: LlmClient; fetcher: Fetcher };

let services: PipelineServices | null = null;

// Called once at startup so a missing GROQ_API_KEY fails fast, before the server accepts traffic
export function initPipelineServices(): void {
  const config = loadPipelineConfig();
  services = {
    llm: new LlmClient({ config, logger }),
    fetcher: createSafeFetcher({ allowPrivateHosts: config.allowPrivateHosts }),
  };
}

export function getPipelineServices(): PipelineServices {
  if (!services) {
    throw new Error("Pipeline services not initialised. Call initPipelineServices() at startup.");
  }

  return services;
}
