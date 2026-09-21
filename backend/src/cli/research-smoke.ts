import "dotenv/config";
import { readFile } from "node:fs/promises";
import { roleHints } from "../pipeline/research/role-hints.js";
import { parseArgs } from "node:util";
import { loadPipelineConfig } from "../pipeline/config.js";
import { extractJobDescription } from "../pipeline/extraction/jd-extractor.js";
import { LlmClient } from "../pipeline/llm/client.js";
import { pickCompanyName } from "../pipeline/research/company-name.js";
import { searchPublicDiscussion } from "../pipeline/research/discussion.js";
import { extractHiringSignals } from "../pipeline/research/hiring-signals.js";
import { crawlCompany } from "../pipeline/retrieval/crawler.js";
import { createSafeFetcher } from "../pipeline/retrieval/safe-fetch.js";

async function timed<T>(label: string, work: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const result = await work();
  console.error(`[${((Date.now() - started) / 1000).toFixed(1)}s] ${label}`);
  return result;
}

async function main() {
  const { values } = parseArgs({ options: { jd: { type: "string" }, url: { type: "string" } } });
  if (!values.jd || !values.url) {
    console.error("Usage: npm run research:smoke -w backend -- --jd <file> --url <company-url>");
    process.exit(1);
  }

  const config = loadPipelineConfig();
  const llm = new LlmClient({
    config,
    logger: { debug() {}, info: console.error, warn: console.error, error: console.error },
  });
  const fetcher = createSafeFetcher({ allowPrivateHosts: config.allowPrivateHosts });
  const jd = await readFile(values.jd, "utf8");

  const extracted = await timed("requirements extracted", () => extractJobDescription(llm, jd));
  const hints = roleHints(extracted.title);
  const crawl = await timed("company site crawled", () =>
    crawlCompany(values.url!, fetcher, { roleHints: hints }),
  );
  const signals = await timed("hiring signals extracted", () =>
    extractHiringSignals(llm, crawl.pages, hints),
  );

  const company = pickCompanyName({
    fromJd: extracted.company,
    homeTitle: crawl.pages[0]?.title ?? "",
    url: values.url,
  });

  const discussion = await timed(`public discussion searched for "${company}"`, () =>
    searchPublicDiscussion(company, fetcher),
  );

  console.error(`tokens used by this run: ${llm.tokensUsed}`);

  console.log(
    JSON.stringify(
      {
        jd: {
          title: extracted.title,
          company: extracted.company,
          seniority: extracted.seniority,
          thin: extracted.thin,
          warnings: extracted.warnings,
          requirements: extracted.requirements,
        },
        crawl: {
          reachable: crawl.reachable,
          hiringPageFound: crawl.hiringPageFound,
          pages: crawl.pages.map((p) => `${p.kind}  ${p.url}`),
          skipped: crawl.skipped,
        },
        signals,
        discussion: {
          company,
          found: discussion.found,
          skipped: discussion.skipped,
          snippets: discussion.snippets,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((e: unknown) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
