import { z } from "zod";
import type { JsonLlm } from "../llm/port.js";
import type { CrawledPage } from "../retrieval/crawler.js";
import { fenceUntrusted, UNTRUSTED_NOTICE } from "../security/untrusted.js";

const MAX_PAGES = 3;
const CHARS_PER_PAGE = 2_000;
const MAX_STAGES = 8;

export type HiringStage = { name: string; description: string };

export type HiringSignals = {
  found: boolean; // True only when a page actually described how the company interviews

  stages: HiringStage[];
  takeHome: boolean;
  systemDesign: boolean;
  liveCoding: boolean;
  cultureNotes: string[];
  sources: string[];
};

export const NO_HIRING_SIGNALS: HiringSignals = {
  found: false,
  stages: [],
  takeHome: false,
  systemDesign: false,
  liveCoding: false,
  cultureNotes: [],
  sources: [],
};

const modelOutputSchema = z.object({
  describes_interview_process: z.boolean(),
  stages: z.array(z.object({ name: z.string(), description: z.string() })),
  take_home: z.boolean(),
  system_design: z.boolean(),
  live_coding: z.boolean(),
  culture_notes: z.array(z.string()),
});

const SYSTEM_PROMPT = `You read a company's own hiring pages and report how the company interviews candidates.
${UNTRUSTED_NOTICE}

Rules:
- Report only what the pages explicitly say. Do not assume standard practice.
- If the pages do not describe an interview or hiring process, set "describes_interview_process" to false and leave "stages" empty.
- "stages": the steps in order, each with a short name (for example "Take-home task") and a one-sentence description (at most ${MAX_STAGES} stages).
- "take_home", "system_design", "live_coding": true only if the pages explicitly mention that kind of step.
- "culture_notes": up to 3 short facts about how the company works or what it values, taken from the pages.`;

// The model's yes/no flags are checked against the source text, so it cannot invent a round
const TAKE_HOME_RE = /take[- ]?home|home ?work|work sample|assignment/i;
const SYSTEM_DESIGN_RE =
  /system design|architecture (?:interview|round|discussion)|design (?:interview|round)/i;
const LIVE_CODING_RE =
  /live cod|pair(?:ed)? programming|\bpairing\b|coding (?:interview|round|exercise|challenge)|whiteboard/i;

function pickHiringPages(
  pages: readonly CrawledPage[],
  roleHints: readonly string[],
): CrawledPage[] {
  const score = (p: CrawledPage): number => {
    const haystack = `${p.url} ${p.title}`.toLowerCase();
    const roleMatches = roleHints.filter((h) => haystack.includes(h)).length;
    return (
      (/interview/.test(haystack) ? 2 : 0) +
      (/hir(?:e|ing)/.test(haystack) ? 1 : 0) +
      3 * roleMatches
    );
  };

  return pages
    .filter((p) => p.kind === "hiring")
    .sort((a, b) => score(b) - score(a))
    .slice(0, MAX_PAGES);
}

export async function extractHiringSignals(
  llm: JsonLlm,
  pages: readonly CrawledPage[],
  roleHints: readonly string[] = [],
): Promise<HiringSignals> {
  const selected = pickHiringPages(pages, roleHints);
  if (selected.length === 0) {
    return NO_HIRING_SIGNALS; // nothing to read, so no LLM call
  }

  const sourceText = selected
    .map((p) => `URL: ${p.url}\nTITLE: ${p.title}\n${p.text.slice(0, CHARS_PER_PAGE)}`)
    .join("\n\n---\n\n");

  const raw = await llm.completeJson({
    system: SYSTEM_PROMPT,
    user: fenceUntrusted("hiring_pages", sourceText),
    schema: modelOutputSchema,
    schemaName: "hiring_signals",
    maxTokens: 1200,
  });

  const takeHome = raw.take_home && TAKE_HOME_RE.test(sourceText);
  const systemDesign = raw.system_design && SYSTEM_DESIGN_RE.test(sourceText);
  const liveCoding = raw.live_coding && LIVE_CODING_RE.test(sourceText);

  const stages = raw.describes_interview_process
    ? raw.stages
        .map((s) => ({
          name: s.name.trim().slice(0, 80),
          description: s.description.trim().slice(0, 240),
        }))
        .filter((s) => s.name)
        .slice(0, MAX_STAGES)
    : [];

  const found =
    raw.describes_interview_process &&
    (stages.length > 0 || takeHome || systemDesign || liveCoding);

  if (!found)
    return {
      ...NO_HIRING_SIGNALS,
      cultureNotes: raw.culture_notes.map((n) => n.trim().slice(0, 200)).slice(0, 3),
    };

  return {
    found,
    stages,
    takeHome,
    systemDesign,
    liveCoding,
    cultureNotes: raw.culture_notes.map((n) => n.trim().slice(0, 200)).slice(0, 3),
    sources: selected.map((p) => p.url),
  };
}
