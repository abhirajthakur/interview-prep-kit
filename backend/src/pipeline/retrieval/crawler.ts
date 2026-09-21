import { isLocalHost, rankLinks } from "./link-scoring.js";
import { withScheme } from "./net-guard.js";
import { cleanPage, dedupeKey, type CleanPage, type PageLink } from "./page.js";
import { loadRobots, type RobotsPolicy } from "./robots.js";
import type { Fetcher } from "./safe-fetch.js";
import { loadSitemapLinks } from "./sitemap.js";

export type PageKind = "home" | "hiring" | "about" | "other";
export type CrawledPage = CleanPage & { kind: PageKind };
export type SkippedSource = { url: string; reason: string };

export type CrawlResult = {
  // False when the homepage itself could not be retrieved
  reachable: boolean;
  startUrl: string;
  pages: CrawledPage[];
  skipped: SkippedSource[];
  hiringPageFound: boolean;
};

export type CrawlOptions = {
  maxPages?: number;
  maxDepth?: number;
  roleHints?: readonly string[] | undefined;
};

const HIRING_HINT = /interview|\bhir(e|ing)\b|recruit|\bcareers?\b|\bjobs?\b|\bjoin\b/;
const ABOUT_HINT = /about|company|team|mission|culture|values|handbook|people/;
const LINKS_PER_DEPTH = [4, 3];

function classify(page: CleanPage, isHome: boolean): PageKind {
  if (isHome) return "home";
  const haystack = `${new URL(page.url).pathname} ${page.title}`
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  if (HIRING_HINT.test(haystack)) return "hiring";
  if (ABOUT_HINT.test(haystack)) return "about";
  return "other";
}

/**
 * Homepage -> rank its links (plus sitemap URLs) -> fetch the best few ->
 * follow links found on hiring pages one level deeper. Nothing here throws:
 * anything that can't be retrieved is recorded in `skipped`.
 */
export async function crawlCompany(
  rawUrl: string,
  fetcher: Fetcher,
  options: CrawlOptions = {},
): Promise<CrawlResult> {
  const maxPages = options.maxPages ?? 8;
  const maxDepth = options.maxDepth ?? 2;
  const startUrl = withScheme(rawUrl);
  const pages: CrawledPage[] = [];
  const skipped: SkippedSource[] = [];
  const visited = new Set<string>();
  const robotsByOrigin = new Map<string, RobotsPolicy>();

  let start: URL;
  try {
    start = new URL(startUrl);
  } catch {
    return {
      reachable: false,
      startUrl,
      pages,
      skipped: [{ url: rawUrl, reason: "Not a valid URL" }],
      hiringPageFound: false,
    };
  }
  const homeUrl = start.toString(); // normalised: "https://acme.test" -> "https://acme.test/"

  const robotsFor = async (url: string) => {
    const origin = new URL(url).origin;
    const cached = robotsByOrigin.get(origin);
    if (cached) {
      return cached;
    }

    const policy = await loadRobots(origin, fetcher);
    robotsByOrigin.set(origin, policy);
    return policy;
  };

  const visit = async (url: string, isHome = false): Promise<CrawledPage | null> => {
    const key = dedupeKey(url);
    if (visited.has(key)) {
      return null;
    }
    visited.add(key);

    const robots = await robotsFor(url);
    if (!robots.isAllowed(url)) {
      skipped.push({ url, reason: "Disallowed by robots.txt" });
      return null;
    }

    const res = await fetcher(url, { truncate: true, maxBytes: 3_000_000 });
    if (!res.ok) {
      skipped.push({ url, reason: res.message });
      return null;
    }
    // Remember the final URL too, because redirects may have happened.
    visited.add(dedupeKey(res.url));

    const clean = cleanPage(res.body, res.url);
    const page: CrawledPage = { ...clean, kind: classify(clean, isHome) };
    pages.push(page);

    return page;
  };

  const home = await visit(homeUrl, true);
  if (!home) {
    return { reachable: false, startUrl: homeUrl, pages, skipped, hiringPageFound: false };
  }

  const robots = await robotsFor(home.url);

  // If robots.txt tells us where the sitemap is, use that. Otherwise, guess /sitemap.xml
  const sitemapUrls =
    robots.sitemaps.length > 0 ? robots.sitemaps : [new URL("/sitemap.xml", home.url).toString()];
  const sitemapLinks = await loadSitemapLinks(sitemapUrls, fetcher);

  // If several companies are served from one local server (/acme/, /other/), stay inside this one.
  const pathPrefix = isLocalHost(start.hostname) ? start.pathname.replace(/[^/]*$/, "") : "";

  // URLs we currently have available to consider crawling
  let frontier: PageLink[] = [...home.links, ...sitemapLinks];
  for (let depth = 1; depth <= maxDepth && pages.length < maxPages; depth++) {
    const picks = rankLinks(frontier, {
      baseUrl: home.url,
      exclude: visited,
      limit: LINKS_PER_DEPTH[depth - 1] ?? 3,
      pathPrefix,
      roleHints: options.roleHints,

      // After the first level, only follow pages that match the role once a hiring page has been found
      requireRoleMatch: depth > 1 && pages.some((p) => p.kind === "hiring"),
    });

    const fetched: CrawledPage[] = [];
    for (const { link } of picks) {
      if (pages.length >= maxPages) {
        break;
      }

      const page = await visit(link.url);
      if (page) {
        fetched.push(page);
      }
    }

    // Only hiring pages are worth expanding: that is where the process page tends to hide.
    frontier = fetched.filter((p) => p.kind === "hiring").flatMap((p) => p.links);
    if (frontier.length === 0) break;
  }

  return {
    reachable: true,
    startUrl: homeUrl,
    pages,
    skipped,
    hiringPageFound: pages.some((p) => p.kind === "hiring"),
  };
}
