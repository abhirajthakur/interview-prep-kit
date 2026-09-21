import { z } from "zod";
import type { JsonLlm } from "../llm/port.js";
import type { CrawledPage } from "../retrieval/crawler.js";
import { fenceUntrusted, UNTRUSTED_NOTICE } from "../security/untrusted.js";

const MAX_PAGES = 3;
const CHARS_PER_PAGE = 1_800;
const MIN_SOURCE_CHARS = 300;

export type CompanyBrief = {
  summary: string;
  what_they_do: string;
  sources: string[];
  grounded: boolean;
};

const outputSchema = z.object({
  insufficient: z.boolean(),
  summary: z.string(),
  what_they_do: z.string(),
});

const SYSTEM_PROMPT = `You write a short, factual company brief for a job candidate, using only the web pages provided.
${UNTRUSTED_NOTICE}

Rules:
- Use only facts stated in the pages. Never add facts from your own knowledge, even if you recognise the company.
- "summary": 2 to 3 sentences on what the company is, who it serves, and anything notable the pages state (size, stage, values).
- "what_they_do": one sentence naming the product or service and its customers.
- If the pages do not say what the company does, set "insufficient" to true and leave both other fields empty.
- Do not mention "the pages" or that you were given pages.`;

const KIND_ORDER: Record<CrawledPage["kind"], number> = { home: 0, about: 1, other: 2, hiring: 3 };

/** The honest brief for when nothing usable was found. No model call, nothing invented. */
export function unavailableBrief(companyName: string): CompanyBrief {
  const name = companyName.trim() || "this company";
  return {
    summary: `No information about ${name} could be retrieved from its website, so this brief is intentionally minimal. Research the company directly before the interview: its product, customers and recent news.`,
    what_they_do: "Not found on the company's website.",
    sources: [],
    grounded: false,
  };
}

/** Hiring pages are read by the hiring-signals step; the brief uses the home, about and other pages. */
function pickBriefPages(pages: readonly CrawledPage[]): CrawledPage[] {
  return pages
    .filter((p) => p.kind !== "hiring")
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
    .slice(0, MAX_PAGES);
}

export async function generateCompanyBrief(
  llm: JsonLlm,
  args: { companyName: string; pages: readonly CrawledPage[] },
): Promise<CompanyBrief> {
  const selected = pickBriefPages(args.pages);
  const readable = selected.reduce(
    (sum, p) => sum + p.title.length + p.description.length + p.text.length,
    0,
  );
  if (readable < MIN_SOURCE_CHARS) return unavailableBrief(args.companyName); // e.g. a JavaScript-only shell

  const sourceText = selected
    .map((p) =>
      [
        `URL: ${p.url}`,
        p.title && `TITLE: ${p.title}`,
        p.description && `DESCRIPTION: ${p.description}`,
        p.text.slice(0, CHARS_PER_PAGE),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n---\n\n");

  const raw = await llm.completeJson({
    system: SYSTEM_PROMPT,
    user: `Company: ${args.companyName || "unknown"}\n\n${fenceUntrusted("company_pages", sourceText)}`,
    schema: outputSchema,
    schemaName: "company_brief",
    maxTokens: 700,
  });

  if (raw.insufficient || raw.summary.trim() === "") return unavailableBrief(args.companyName);
  return {
    summary: raw.summary.trim().slice(0, 700),
    what_they_do: raw.what_they_do.trim().slice(0, 300),
    sources: selected.map((p) => p.url),
    grounded: true,
  };
}
