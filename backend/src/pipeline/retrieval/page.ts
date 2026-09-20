import * as cheerio from "cheerio";

export type PageLink = { url: string; text: string };

export type CleanPage = {
  url: string;
  title: string;
  description: string;
  text: string;
  links: PageLink[];
};

// Caps what one page can contribute to a prompt later (~1.7K tokens).
const MAX_TEXT_CHARS = 6_000;
const SKIP_EXTENSIONS =
  /\.(pdf|png|jpe?g|gif|svg|webp|ico|zip|gz|mp4|mp3|css|js|json|xml|woff2?|ttf|docx?|xlsx?|pptx?)$/i;

const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();

// Key for "have we seen this page": ignores hash, trailing slash and host case
export function dedupeKey(url: string): string {
  const u = new URL(url);
  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, "") : u.pathname;
  return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
}

function extractLinks($: cheerio.CheerioAPI, base: string): PageLink[] {
  const seen = new Set<string>();
  const links: PageLink[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    let u: URL;
    try {
      u = new URL(href, base); // resolves relative links against the page URL
    } catch {
      return;
    }

    if (u.protocol !== "http:" && u.protocol !== "https:") return;
    if (SKIP_EXTENSIONS.test(u.pathname)) return;

    u.hash = "";
    const url = u.toString();
    if (seen.has(url)) return;
    seen.add(url);
    links.push({ url, text: collapse($(el).text()).slice(0, 120) });
  });

  return links;
}

/**
 * Turns raw HTML into plain text plus links. The text is untrusted content:
 * it is only ever passed to the model as quoted data, never as instructions.
 */
export function cleanPage(html: string, pageUrl: string): CleanPage {
  const $ = cheerio.load(html);
  const title = collapse($("title").first().text());
  const description = collapse($('meta[name="description"]').attr("content") ?? "");

  // Links first: navigation and footers are where careers links usually live.
  const links = extractLinks($, pageUrl);

  $("script, style, noscript, svg, iframe, form, nav, footer, template").remove();
  $("p, div, li, h1, h2, h3, h4, h5, h6, tr, td, section, article, br").after(" ");
  const main = $("main").first();
  const text = collapse((main.length > 0 ? main : $("body")).text()).slice(0, MAX_TEXT_CHARS);

  return { url: pageUrl, title, description, text, links };
}
