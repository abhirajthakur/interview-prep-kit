import * as cheerio from "cheerio";
import { z } from "zod";
import type { SkippedSource } from "../retrieval/crawler.js";
import type { Fetcher } from "../retrieval/safe-fetch.js";

const SEARCH_API = "https://hn.algolia.com/api/v1/search";
const MAX_SNIPPETS = 5;
const PROXIMITY_CHARS = 350;
const SNIPPET_BEFORE = 150;
const SNIPPET_AFTER = 450;

const INTERVIEW_RE =
  /\binterview(?:s|ed|ing|er|ers)?\b|take[- ]?home|phone screen|on-?site|super ?day|coding challenge|hiring process|technical round/gi;

/** "Interview" also means user research. Require words that place the discussion in a hiring context. */
const JOB_CONTEXT_RE =
  /\b(?:jobs?|hire[sd]?|hiring|candidates?|recruit\w*|applicants?|applied|on-?site|take-?home|phone screen|super ?day|leetcode|work trial)\b|interview process|interview (?:loop|rounds?|questions?|stages?)|technical (?:interview|round)|coding (?:challenge|exercise|interview)/i;

const OFF_TOPIC_THREAD_RE = /who is hiring|who wants to be hired|seeking freelancer/i;

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

// A window around `at`, trimmed to word boundaries, with an ellipsis where text was cut
function excerpt(text: string, at: number): string {
  let start = Math.max(0, at - SNIPPET_BEFORE);
  let end = Math.min(text.length, at + SNIPPET_AFTER);
  if (start > 0) {
    const space = text.indexOf(" ", start);
    if (space !== -1 && space < at) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(" ", end);
    if (space > at) end = space;
  }
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

// The excerpt around the first interview keyword that has the company name and job context nearby
function findRelevantWindow(text: string, nameRe: RegExp): string | null {
  for (const match of text.matchAll(INTERVIEW_RE)) {
    const at = match.index ?? 0;
    const near = text.slice(Math.max(0, at - PROXIMITY_CHARS), at + PROXIMITY_CHARS);
    if (nameRe.test(near) && JOB_CONTEXT_RE.test(near)) return excerpt(text, at);
  }
  return null;
}

/**
 * Public interview discussion from Hacker News (Algolia's free search API). A hit only counts if the
 * company name appears close to an interview keyword AND the surrounding text is about hiring.
 * Snippets are untrusted text.
 */
export async function searchPublicDiscussion(
  company: string,
  fetcher: Fetcher,
): Promise<DiscussionResult> {
  const name = company.trim();
  if (name.length < 2) {
    return { found: false, snippets: [], skipped: null };
  }

  const url = `${SEARCH_API}?${new URLSearchParams({ query: `${name} interview`, tags: "(story,comment)", hitsPerPage: "30" })}`;
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

    const title = collapse(h.title ?? h.story_title ?? "");
    if (OFF_TOPIC_THREAD_RE.test(title)) continue;

    const html = (h.comment_text ?? h.story_text ?? "").replace(/<(?:p|br)\s*\/?>/gi, " ");
    const body = collapse(cheerio.load(html).text()).replace(/https?:\/\/\S+/g, "[link]");

    // Body first, then the title alone, then both together, so titles are not glued onto snippets needlessly.
    const candidates = [body, title, [title, body].filter(Boolean).join(". ")].filter(Boolean);
    let window: string | null = null;
    for (const text of candidates) {
      window = findRelevantWindow(text, nameRe);
      if (window) break;
    }
    if (!window) continue;

    snippets.push({
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      title,
      text: window,
    });

    if (snippets.length >= MAX_SNIPPETS) break;
  }

  return { found: snippets.length > 0, snippets, skipped: null };
}
