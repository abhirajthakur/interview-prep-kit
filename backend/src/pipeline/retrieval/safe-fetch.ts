import { checkUrl } from "./net-guard.js";

export const BOT_NAME = "InterviewPrepKitBot";
const USER_AGENT = `${BOT_NAME}/1.0 (interview preparation research)`;
const MAX_REDIRECTS = 3;
const HTML_TYPES = ["text/html", "application/xhtml+xml"];

export type FetchFailureReason =
  | "invalid_url"
  | "blocked_host"
  | "unreachable"
  | "not_found"
  | "timeout"
  | "network"
  | "http_error"
  | "bad_content_type"
  | "too_large"
  | "too_many_redirects";

export type FetchResult =
  | { ok: true; url: string; contentType: string; body: string }
  | { ok: false; url: string; reason: FetchFailureReason; message: string; status: number | null };

export type FetchOptions = { allowedTypes?: readonly string[]; maxBytes?: number };
export type Fetcher = (url: string, options?: FetchOptions) => Promise<FetchResult>;

export type SafeFetcherConfig = {
  allowPrivateHosts: boolean;
  timeoutMs?: number;
  maxRetries?: number;
  /** Minimum gap between requests to the same host. */
  minHostGapMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

type Attempt = { result: FetchResult; retryable: boolean };

async function readCapped(res: Response, maxBytes: number): Promise<string | null> {
  const reader = res.body?.getReader();
  if (!reader) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function discard(res: Response): void {
  void res.body?.cancel().catch(() => undefined);
}

export function createSafeFetcher(config: SafeFetcherConfig): Fetcher {
  const timeoutMs = config.timeoutMs ?? 10_000;
  const maxRetries = config.maxRetries ?? 2;
  const minHostGapMs = config.minHostGapMs ?? 400;
  const doFetch = config.fetchImpl ?? fetch;
  const sleep = config.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const lastRequestAt = new Map<string, number>(); // host -> last request time

  const throttle = async (host: string) => {
    const wait = (lastRequestAt.get(host) ?? 0) + minHostGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt.set(host, Date.now());
  };

  const fail = (
    url: string,
    reason: FetchFailureReason,
    message: string,
    status: number | null,
    retryable: boolean,
  ): Attempt => ({ result: { ok: false, url, reason, message, status }, retryable });

  const attempt = async (startUrl: string, options: FetchOptions): Promise<Attempt> => {
    const allowedTypes = options.allowedTypes ?? HTML_TYPES;
    const maxBytes = options.maxBytes ?? 1_000_000;
    let current = startUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // Every hop is validated again, so a redirect cannot smuggle us to a private address.
      const check = await checkUrl(current, config.allowPrivateHosts);
      if (!check.ok) {
        return fail(current, check.reason, check.message, null, false);
      }
      await throttle(check.url.host);

      let res: Response;
      try {
        res = await doFetch(check.url, {
          redirect: "manual",
          headers: {
            "user-agent": USER_AGENT,
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8",
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const timedOut =
          err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        const message = timedOut
          ? `Timed out after ${timeoutMs}ms`
          : `Network error: ${err instanceof Error ? err.message : String(err)}`;
        return fail(current, timedOut ? "timeout" : "network", message, null, true);
      }

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        discard(res);
        if (!location)
          return fail(
            current,
            "http_error",
            `HTTP ${res.status} without Location`,
            res.status,
            false,
          );
        try {
          current = new URL(location, current).toString();
        } catch {
          return fail(current, "http_error", "Invalid redirect target", res.status, false);
        }
        continue;
      }

      if (res.status === 404 || res.status === 410) {
        discard(res);
        return fail(current, "not_found", `HTTP ${res.status}`, res.status, false);
      }
      if (res.status === 429 || res.status >= 500) {
        discard(res);
        return fail(current, "http_error", `HTTP ${res.status}`, res.status, true);
      }
      if (!res.ok) {
        discard(res);
        return fail(current, "http_error", `HTTP ${res.status}`, res.status, false);
      }

      const contentType =
        (res.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";

      if (contentType && !allowedTypes.includes(contentType)) {
        discard(res);
        return fail(
          current,
          "bad_content_type",
          `Unsupported content type ${contentType}`,
          res.status,
          false,
        );
      }
      const declaredBytes = Number(res.headers.get("content-length"));
      if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
        discard(res);
        return fail(
          current,
          "too_large",
          `Response larger than ${maxBytes} bytes`,
          res.status,
          false,
        );
      }

      let body: string | null;
      try {
        body = await readCapped(res, maxBytes);
      } catch (e) {
        return fail(
          current,
          "network",
          `Network error while reading: ${e instanceof Error ? e.message : String(e)}`,
          null,
          true,
        );
      }

      // readCapped() returns null when the response exceeds the limit
      if (body === null)
        return fail(
          current,
          "too_large",
          `Response larger than ${maxBytes} bytes`,
          res.status,
          false,
        );

      return { result: { ok: true, url: current, contentType, body }, retryable: false };
    }
    return fail(current, "too_many_redirects", `More than ${MAX_REDIRECTS} redirects`, null, false);
  };

  return async (url, options = {}) => {
    let last = await attempt(url, options);
    for (let i = 0; i < maxRetries && !last.result.ok && last.retryable; i++) {
      await sleep(500 * 2 ** i);
      last = await attempt(url, options);
    }

    const res = last.result;
    if (!res.ok && last.retryable) {
      return { ...res, message: `${res.message} (after ${maxRetries + 1} attempts)` };
    }

    return res;
  };
}
