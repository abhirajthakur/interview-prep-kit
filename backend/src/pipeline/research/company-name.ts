import { isLocalHost, siteKey } from "../retrieval/link-scoring.js";
import { withScheme } from "../retrieval/net-guard.js";

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
    return siteKey(url.hostname).split(".")[0] ?? "";
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
