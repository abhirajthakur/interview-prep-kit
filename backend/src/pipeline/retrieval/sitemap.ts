import * as cheerio from "cheerio";
import type { PageLink } from "./page.js";
import type { Fetcher } from "./safe-fetch.js";

const XML_TYPES = ["application/xml", "text/xml", "text/plain"];
const MAX_SITEMAP_FILES = 5;
const MAX_URLS = 5_000; // ranking thousands of URLs is free; only the top few get fetched

/**
 * Sitemaps expose pages nobody links to from the homepage (e.g. /handbook/hiring/interviewing).
 * Reads up to 5 files, following one level of sitemap indexes. Failures are silent: no sitemap is normal.
 */
export async function loadSitemapLinks(
  sitemapUrls: readonly string[],
  fetcher: Fetcher,
): Promise<PageLink[]> {
  const queue = [...sitemapUrls];
  const urls: string[] = [];
  let filesRead = 0;

  while (queue.length > 0 && filesRead < MAX_SITEMAP_FILES && urls.length < MAX_URLS) {
    const next = queue.shift();
    if (!next) {
      break;
    }

    filesRead++;

    const res = await fetcher(next, {
      allowedTypes: XML_TYPES,
      maxBytes: 5_000_000,
      truncate: true,
    });

    if (!res.ok) {
      continue;
    }

    const $ = cheerio.load(res.body, { xml: true });
    $("loc").each((_, el) => {
      const loc = $(el).text().trim();
      if (!loc) return;

      if (/\.xml$/i.test(loc)) {
        queue.push(loc);
      } else {
        urls.push(loc);
      }
    });
  }

  return urls.slice(0, MAX_URLS).map((url) => ({ url, text: "" }));
}
