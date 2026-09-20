import * as cheerio from "cheerio";
import { z } from "zod";
import type { SkippedSource } from "../retrieval/crawler.js";
import type { Fetcher } from "../retrieval/safe-fetch.js";

const SEARCH_API = "https://hn.algolia.com/api/v1/search";
const MAX_SNIPPETS = 5;
const SNIPPET_CHARS = 600;
const INTERVIEW_RE =
  /interview|hiring process|take[- ]?home|on-?site|recruiter|phone screen|coding challenge/i;

export type DiscussionSnippet = { url: string; title: string; text: string };

export type DiscussionResult = {
  found: boolean;
  snippets: DiscussionSnippet[];

  // Set when the search itself failed, so it can be reported as a skipped source
  skipped: SkippedSource | null;
};

const hitSchema = z.object({
  objectID: z.string(),
  title: z.string().nullish(),
  story_title: z.string().nullish(),
  comment_text: z.string().nullish(),
  story_text: z.string().nullish(),
});

const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Public interview discussion from Hacker News (Algolia's free search API).
 * A hit only counts if it names the company AND talks about interviewing, so a common
 * name like "Acme" cannot pull in unrelated threads. Snippets are untrusted text.
 */
export async function searchPublicDiscussion(
  company: string,
  fetcher: Fetcher,
): Promise<DiscussionResult> {
  const name = company.trim();
  if (name.length < 2) {
    return { found: false, snippets: [], skipped: null };
  }

  const url = `${SEARCH_API}?${new URLSearchParams({ query: `${name} interview`, tags: "(story,comment)", hitsPerPage: "20" })}`;
  const res = await fetcher(url, { allowedTypes: ["application/json"], maxBytes: 1_000_000 });
  if (!res.ok) {
    return { found: false, snippets: [], skipped: { url, reason: res.message } };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(res.body);
  } catch {
    return {
      found: false,
      snippets: [],
      skipped: { url, reason: "Search API returned invalid JSON" },
    };
  }
  const parsed = z.object({ hits: z.array(z.unknown()) }).safeParse(payload);
  if (!parsed.success)
    return {
      found: false,
      snippets: [],
      skipped: { url, reason: "Unexpected search API response" },
    };

  const nameRe = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "iu");
  const snippets: DiscussionSnippet[] = [];

  for (const rawHit of parsed.data.hits) {
    const hit = hitSchema.safeParse(rawHit);
    if (!hit.success) continue;
    const h = hit.data;

    const title = h.title ?? h.story_title ?? "";
    const html = h.comment_text ?? h.story_text ?? "";
    const text = collapse(cheerio.load(html).text());
    const haystack = `${title} ${text}`;
    if (!nameRe.test(haystack) || !INTERVIEW_RE.test(haystack)) continue;

    snippets.push({
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      title: collapse(title),
      text: text.slice(0, SNIPPET_CHARS),
    });
    if (snippets.length >= MAX_SNIPPETS) break;
  }

  return { found: snippets.length > 0, snippets, skipped: null };
}
