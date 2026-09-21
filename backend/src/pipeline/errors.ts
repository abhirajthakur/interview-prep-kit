import { LlmError } from "./llm/errors.js";

export type PipelineErrorCode = "INVALID_INPUT" | "KIT_INVALID";

export class PipelineError extends Error {
  constructor(
    message: string,
    readonly code: PipelineErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PipelineError";
  }
}

export type ErrorInfo = { code: string; message: string };

/** Turns anything thrown by the pipeline into the { code, message } shape used in batch output and the API. */
export function describeError(e: unknown): ErrorInfo {
  if (e instanceof PipelineError || e instanceof LlmError)
    return { code: e.code, message: e.message };
  return { code: "INTERNAL_ERROR", message: e instanceof Error ? e.message : String(e) };
}
