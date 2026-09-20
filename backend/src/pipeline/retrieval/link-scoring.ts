import { dedupeKey, type PageLink } from "./page.js";

type Signal = { pattern: RegExp; weight: number };

const SIGNALS: Signal[] = [
  { pattern: /interview|how-we-hire|hiring-(process|guide)|selection-process/, weight: 10 },
  { pattern: /hiring|recruit|talent/, weight: 7 },
  {
    pattern: /\b(careers?|jobs?|join(-us|-our-team)?|work-(with|at|for)-us|open-roles|openings)\b/,
    weight: 6,
  },
  { pattern: /handbook|how-we-work|culture|values|principles/, weight: 4 },
  { pattern: /\b(about|company|who-we-are|our-story|mission|team|people)\b/, weight: 3 },
  { pattern: /\b(engineering|blog|product|customers)\b/, weight: 2 },
];

const PENALTIES: Signal[] = [
  {
    pattern:
      /\b(log-?in|sign-?(in|up)|register|cart|checkout|privacy|terms|cookies?|legal|unsubscribe|password|account)\b/,
    weight: 12,
  },
  { pattern: /\/(tag|tags|category|author|page)\/|[?&](page|utm_[a-z]+|replytocom)=/, weight: 5 },
];

const normalize = (s: string): string => s.toLowerCase().replace(/[_\s]+/g, "-");
const safeDecode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function scoreLink(link: PageLink): number {
  const u = new URL(link.url);
  const path = normalize(safeDecode(u.pathname));
  const text = normalize(link.text);

  let score = 0;
  for (const { pattern, weight } of SIGNALS) {
    if (pattern.test(path)) score += weight;
    else if (pattern.test(text)) score += weight * 0.6; // anchor text is weaker evidence than the path
  }
  for (const { pattern, weight } of PENALTIES) {
    if (pattern.test(path + u.search)) score -= weight;
  }
  return score;
}

export function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(h) ||
    h.includes(":")
  );
}

// Rough registrable domain, so handbook.acme.com and www.acme.com count as the same company
export function siteKey(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  if (isLocalHost(host)) {
    return host;
  }

  const labels = host.split(".");
  const twoLevelTld =
    labels.length >= 3 && /^(co|com|org|net|gov|ac)$/.test(labels[labels.length - 2] ?? "");

  return labels.slice(twoLevelTld ? -3 : -2).join(".");
}

export type RankOptions = {
  baseUrl: string;
  exclude: ReadonlySet<string>;
  limit: number;
  // Only follow links under this path (used for local hosts). "" means no restriction.
  pathPrefix: string;
};
export type RankedLink = { link: PageLink; score: number };

export function rankLinks(links: readonly PageLink[], options: RankOptions): RankedLink[] {
  const baseKey = siteKey(new URL(options.baseUrl).hostname);
  const seen = new Set<string>();
  const ranked: RankedLink[] = [];

  for (const link of links) {
    let u: URL;
    try {
      u = new URL(link.url);
    } catch {
      continue;
    }
    const key = dedupeKey(u.toString());
    if (options.exclude.has(key) || seen.has(key)) continue;
    seen.add(key);

    if (siteKey(u.hostname) !== baseKey) continue;
    if (options.pathPrefix && !u.pathname.startsWith(options.pathPrefix)) continue;

    const score = scoreLink(link);
    if (score > 0) {
      ranked.push({ link, score });
    }
  }

  return ranked
    .sort((a, b) => b.score - a.score || a.link.url.length - b.link.url.length)
    .slice(0, options.limit);
}
