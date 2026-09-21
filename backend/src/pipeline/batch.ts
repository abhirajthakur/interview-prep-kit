import { createHash } from "node:crypto";
import { z } from "zod";
import type { BuildKitInput } from "./build-kit.js";
import { describeError, type ErrorInfo } from "./errors.js";
import type { Kit } from "./kit.schema.js";

const caseSchema = z.object({
  id: z.string().min(1),
  jd: z.string(),
  company_url: z.string(),
  days: z.coerce.number().int(),
});

export type BatchEntry =
  | { id: string; status: "ok"; kit: Kit; error: null }
  | { id: string; status: "failed"; kit: null; error: ErrorInfo };

export type BatchOutput = { version: "1.0"; generated_at: string; kits: BatchEntry[] };

export type RunCase = (input: BuildKitInput, caseId: string) => Promise<Kit>;

export type BatchHooks = {
  onCaseStart?: ((info: { index: number; total: number; id: string }) => void) | undefined;
  onCaseDone?:
    | ((entry: BatchEntry, info: { index: number; total: number; reused: boolean }) => void)
    | undefined;
};

function caseId(raw: unknown, index: number): string {
  if (typeof raw === "object" && raw !== null && "id" in raw) {
    const id = (raw as { id: unknown }).id;
    if (typeof id === "string" && id !== "") return id;
  }
  return `case-${index + 1}`;
}

const contentKey = (jd: string, url: string, days: number): string =>
  createHash("sha256")
    .update(JSON.stringify([jd, url.trim(), days]))
    .digest("hex");

/**
 * One entry per input case, in order. A failing case never stops the run, and an identical posting is only
 * computed once.
 *
 * The batch logic without any file I/O, so it can be unit-tested.
 */
export async function runBatch(
  cases: readonly unknown[],
  run: RunCase,
  hooks: BatchHooks = {},
): Promise<BatchEntry[]> {
  const entries: BatchEntry[] = [];
  const finished = new Map<string, Kit>();
  const total = cases.length;

  for (const [index, raw] of cases.entries()) {
    const id = caseId(raw, index);
    hooks.onCaseStart?.({ index, total, id });

    let entry: BatchEntry;
    let reused = false;
    const parsed = caseSchema.safeParse(raw);

    if (!parsed.success) {
      const problems = parsed.error.issues
        .map((i) => `${i.path.join(".") || "case"}: ${i.message}`)
        .join("; ");
      entry = {
        id,
        status: "failed",
        kit: null,
        error: { code: "INVALID_INPUT", message: `Invalid case (${problems})` },
      };
    } else {
      const { jd, company_url, days } = parsed.data;
      const key = contentKey(jd, company_url, days);
      const cached = finished.get(key);
      if (cached) {
        entry = { id, status: "ok", kit: structuredClone(cached), error: null };
        reused = true;
      } else {
        try {
          const kit = await run({ jd, companyUrl: company_url, days }, id);
          finished.set(key, kit);
          entry = { id, status: "ok", kit, error: null };
        } catch (e) {
          entry = { id, status: "failed", kit: null, error: describeError(e) };
        }
      }
    }

    entries.push(entry);
    hooks.onCaseDone?.(entry, { index, total, reused });
  }
  return entries;
}

export function toBatchOutput(entries: BatchEntry[], now: Date = new Date()): BatchOutput {
  return {
    version: "1.0",
    generated_at: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    kits: entries,
  };
}
