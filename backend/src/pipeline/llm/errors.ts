export type LlmErrorCode =
  | "LLM_AUTH"
  | "LLM_UNAVAILABLE"
  | "LLM_REQUEST_TOO_LARGE"
  | "LLM_BAD_REQUEST"
  | "LLM_INVALID_OUTPUT";

export class LlmError extends Error {
  constructor(
    message: string,
    readonly code: LlmErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "LlmError";
  }
}
