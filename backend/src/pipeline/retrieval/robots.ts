import robotsParser from "robots-parser";
import { BOT_NAME, type Fetcher } from "./safe-fetch.js";

export type RobotsPolicy = { isAllowed: (url: string) => boolean; sitemaps: string[] };

const ALLOW_ALL: RobotsPolicy = { isAllowed: () => true, sitemaps: [] };

// A missing or unreadable robots.txt is treated as "no restrictions"
export async function loadRobots(origin: string, fetcher: Fetcher): Promise<RobotsPolicy> {
  const robotsUrl = new URL("/robots.txt", origin).toString();
  const res = await fetcher(robotsUrl, { allowedTypes: ["text/plain"], maxBytes: 200_000 });
  if (!res.ok) return ALLOW_ALL;

  // @ts-expect-error robots-parser@3 uses CommonJS `export =` typings
  const robots = robotsParser(robotsUrl, res.body);

  return {
    isAllowed: (url) => robots.isAllowed(url, BOT_NAME) !== false,
    sitemaps: robots.getSitemaps(),
  };
}
