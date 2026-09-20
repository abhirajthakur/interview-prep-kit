import type { LlmClient } from "./client.js";

export type JsonLlm = Pick<LlmClient, "completeJson">;
