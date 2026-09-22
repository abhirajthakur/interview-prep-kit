import { isLocalHost, siteKey } from "../retrieval/link-scoring.js";
import { withScheme } from "../retrieval/net-guard.js";

const RESERVED_TLDS = new Set(["test", "invalid", "example", "localhost", "local"]);
const PLACEHOLDER_NAMES = new Set([
  "example",
  "domain",
  "yourcompany",
  "company",
  "website",
  "localhost",
]);

/**
 * Best guess at the company's name for searching. Order: name found in the posting,
 * then the site's domain, then (for local test hosts) the first path segment or page title.
 */
export function pickCompanyName(args: { fromJd: string; homeTitle: string; url: string }): string {
  const fromJd = args.fromJd.trim();
  if (fromJd && fromJd.length <= 60) {
    return fromJd;
  }

  let url: URL;
  try {
    url = new URL(withScheme(args.url));
  } catch {
    return "";
  }

  if (!isLocalHost(url.hostname)) {
    const labels = siteKey(url.hostname).split(".");
    const name = labels[0] ?? "";
    const tld = labels[labels.length - 1] ?? "";
    // A name guessed from a placeholder domain would only match unrelated text.
    return RESERVED_TLDS.has(tld) || PLACEHOLDER_NAMES.has(name) ? "" : name;
  }

  const segment = url.pathname.split("/").filter(Boolean)[0];
  if (segment) {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }
  return (args.homeTitle.split(/[|–—-]/)[0] ?? "").trim();
}
