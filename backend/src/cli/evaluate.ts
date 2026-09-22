import { config as loadDotenv } from "dotenv";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { runBatch, toBatchOutput } from "../pipeline/batch.js";
import { buildKit } from "../pipeline/build-kit.js";
import { loadPipelineConfig } from "../pipeline/config.js";
import { LlmClient } from "../pipeline/llm/client.js";
import { createSafeFetcher } from "../pipeline/retrieval/safe-fetch.js";

// npm runs workspace scripts from backend/, so relative paths are resolved from where the user ran npm.
const invocationDir = process.env["INIT_CWD"] ?? process.cwd();

const log = (message: string): void => void process.stderr.write(`${message}\n`);

function fail(message: string): never {
  log(`error: ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  loadDotenv({ path: path.resolve(invocationDir, ".env"), quiet: true }); // repo root .env, if any
  loadDotenv({ quiet: true }); // backend/.env

  const { values } = parseArgs({
    options: { input: { type: "string" }, output: { type: "string" } },
  });
  if (!values.input || !values.output) {
    fail("Usage: npm run evaluate -- --input <cases.json> --output <kits.json>");
  }
  const inputPath = path.resolve(invocationDir, values.input);
  const outputPath = path.resolve(invocationDir, values.output);

  let cases: unknown;
  try {
    cases = JSON.parse(await readFile(inputPath, "utf8"));
  } catch (e) {
    fail(`Cannot read ${inputPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!Array.isArray(cases)) fail("The input file must contain a JSON array of cases.");

  let config;
  try {
    config = loadPipelineConfig();
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }

  const llm = new LlmClient({
    config,
    logger: {
      debug() {},
      info() {},
      warn: (message, meta) => log(`    ! ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`),
      error: (message) => log(`    ! ${message}`),
    },
  });
  // The batch command is an operator tool, so it may target local addresses (fixture sites). The web API never does.
  const fetcher = createSafeFetcher({ allowPrivateHosts: true });

  const startedAt = Date.now();
  const elapsed = (): string => `${((Date.now() - startedAt) / 1000).toFixed(0)}s`;

  const entries = await runBatch(
    cases,
    (input, id) =>
      buildKit(input, {
        llm,
        fetcher,
        onProgress: (event) => {
          if (event.status !== "started")
            log(`    ${event.step}: ${event.status}${event.detail ? ` (${event.detail})` : ""}`);
        },
      }).then((kit) => {
        log(
          `  ${id}: ${kit.questions.length} questions, ${kit.flashcards.length} flashcards, ${kit.warnings.length} warnings`,
        );
        return kit;
      }),
    {
      onCaseStart: ({ index, total, id }) =>
        log(`[${index + 1}/${total}] ${id} (${elapsed()} elapsed)`),
      onCaseDone: (entry, { reused }) =>
        log(
          entry.status === "ok"
            ? `  ok${reused ? " (reused identical case)" : ""}`
            : `  FAILED ${entry.error.code}: ${entry.error.message}`,
        ),
    },
  );

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(toBatchOutput(entries), null, 2), "utf8");

  const okCount = entries.filter((e) => e.status === "ok").length;
  log(
    `\nDone in ${elapsed()}: ${okCount} ok, ${entries.length - okCount} failed, ${llm.tokensUsed} LLM tokens. Wrote ${outputPath}`,
  );
}

main().catch((e: unknown) => {
  log(`error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
