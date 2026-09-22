import { mustNotScheduled } from "./coverage/coverage.js";
import { PipelineError } from "./errors.js";
import { extractJobDescription } from "./extraction/jd-extractor.js";
import { generateCompanyBrief, unavailableBrief } from "./generation/company-brief.js";
import { generateFlashcards } from "./generation/flashcards.js";
import { draftQuestions } from "./generation/question-drafting.js";
import { kitSchema, type Kit } from "./kit.schema.js";
import { LlmError } from "./llm/errors.js";
import type { JsonLlm } from "./llm/port.js";
import { pickCompanyName } from "./research/company-name.js";
import { searchPublicDiscussion, type DiscussionResult } from "./research/discussion.js";
import { extractHiringSignals, NO_HIRING_SIGNALS } from "./research/hiring-signals.js";
import { roleHints } from "./research/role-hints.js";
import { crawlCompany, CrawlResult } from "./retrieval/crawler.js";
import type { Fetcher } from "./retrieval/safe-fetch.js";
import { buildSchedule } from "./scheduling/schedule.js";

export const MAX_DAYS = 365;

export type BuildKitInput = { jd: string; companyUrl: string; days: number };

export type PipelineStep =
  | "extract_requirements"
  | "crawl_site"
  | "hiring_process"
  | "public_discussion"
  | "company_brief"
  | "questions"
  | "flashcards"
  | "schedule"
  | "validate";

export type ProgressEvent = {
  step: PipelineStep;
  status: "started" | "done" | "skipped";
  detail?: string | undefined;
};

export type PipelineDeps = {
  llm: JsonLlm;
  fetcher: Fetcher;
  now?: (() => Date) | undefined;
  onProgress?: ((event: ProgressEvent) => void) | undefined;
};

function validateInput(input: BuildKitInput): void {
  if (input.jd.trim() === "")
    throw new PipelineError("The job description is empty.", "INVALID_INPUT");
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > MAX_DAYS) {
    throw new PipelineError(`days must be a whole number from 1 to ${MAX_DAYS}.`, "INVALID_INPUT");
  }
}

/**
 * Runs the full pipeline. Order matters: requirements first (their title steers the crawl), then the site,
 * then what the site says about hiring (which steers the questions). Steps that only enrich the kit degrade
 * to an honest warning instead of failing the run.
 */
export async function buildKit(input: BuildKitInput, deps: PipelineDeps): Promise<Kit> {
  validateInput(input);
  const { llm, fetcher } = deps;
  const now = deps.now ?? (() => new Date());
  const warnings: string[] = [];

  const emit = (step: PipelineStep, status: ProgressEvent["status"], detail?: string): void => {
    deps.onProgress?.({ step, status, detail });
  };

  const step = async <T>(name: PipelineStep, work: () => Promise<T>): Promise<T> => {
    emit(name, "started");
    const result = await work();
    emit(name, "done");
    return result;
  };

  const optional = async <T>(
    name: PipelineStep,
    label: string,
    fallback: T,
    work: () => Promise<T>,
  ): Promise<T> => {
    emit(name, "started");
    try {
      const result = await work();
      emit(name, "done");
      return result;
    } catch (e) {
      if (!(e instanceof LlmError) || e.code === "LLM_AUTH") throw e;
      warnings.push(`${label} could not be generated (${e.message}) and was skipped.`);
      emit(name, "skipped", e.message);
      return fallback;
    }
  };

  // 1. What the posting asks for. Pasted text needs no retrieval.
  const extracted = await step("extract_requirements", () => extractJobDescription(llm, input.jd));
  const hints = roleHints(extracted.title);

  // 2. The company site (skipped when none was given).
  const hasCompanyUrl = input.companyUrl.trim() !== "";
  const crawl: CrawlResult = hasCompanyUrl
    ? await step("crawl_site", () => crawlCompany(input.companyUrl, fetcher, { roleHints: hints }))
    : { reachable: false, startUrl: "", pages: [], skipped: [], hiringPageFound: false };

  const skippedSources = [...crawl.skipped];
  if (!hasCompanyUrl) {
    emit("crawl_site", "skipped", "no company website was given");
    warnings.push(
      "No company website was provided, so this kit is based on the job description only.",
    );
  } else if (!crawl.reachable) {
    const reason = crawl.skipped[0]?.reason;
    warnings.push(
      `The company website could not be retrieved${reason ? ` (${reason})` : ""}. This kit is based on the job description only.`,
    );
  } else if (!crawl.hiringPageFound) {
    warnings.push(
      "No hiring or interview-process page was found on the company site, so the questions follow the role rather than the company's own process.",
    );
  }

  // 3. How the company hires (skipped without an LLM call when no hiring page was found).
  const warningsBeforeSignals = warnings.length;
  const signals = await optional(
    "hiring_process",
    "The hiring-process summary",
    NO_HIRING_SIGNALS,
    () => extractHiringSignals(llm, crawl.pages, hints),
  );

  // Only when the step ran and read the pages (a failure already added its own warning).
  if (crawl.hiringPageFound && !signals.found && warnings.length === warningsBeforeSignals) {
    warnings.push(
      "A careers or hiring page was found, but it does not describe how the company interviews, so the questions follow the role rather than the company's own process.",
    );
  }

  // 4. What candidates say publicly.
  const companyName = pickCompanyName({
    fromJd: extracted.company,
    homeTitle: crawl.pages[0]?.title ?? "",
    url: input.companyUrl,
  });

  emit("public_discussion", "started");
  const discussion: DiscussionResult = companyName
    ? await searchPublicDiscussion(companyName, fetcher)
    : { found: false, snippets: [], skipped: null };

  if (discussion.skipped) {
    skippedSources.push(discussion.skipped);
    warnings.push("The public discussion search failed, so it contributed nothing to this kit.");
  } else if (!companyName) {
    warnings.push(
      "The company name could not be determined, so public discussion was not searched.",
    );
  } else if (!discussion.found) {
    warnings.push("No public discussion of the company's interview process was found.");
  }
  emit("public_discussion", "done");

  // 5. The brief, grounded only in the pages that were fetched.
  const brief = await optional(
    "company_brief",
    "The company brief",
    unavailableBrief(companyName),
    () => generateCompanyBrief(llm, { companyName, pages: crawl.pages }),
  );
  if (crawl.reachable && !brief.grounded) {
    warnings.push("The company site did not provide enough readable content for a company brief.");
  }

  // 6. Questions: one call per category, then the coverage loop.
  emit("questions", "started");
  const draft = await draftQuestions(llm, {
    requirements: extracted.requirements,
    thin: extracted.thin,
    context: {
      roleTitle: extracted.title,
      seniority: extracted.seniority,
      companyName,
      companyFacts: [brief.grounded ? brief.what_they_do : "", ...signals.cultureNotes].filter(
        Boolean,
      ),
      signals,
    },
  });
  warnings.push(...draft.warnings);
  emit("questions", "done", `${draft.passes} pass${draft.passes === 1 ? "" : "es"}`);

  // 7. Flashcards.
  const cards = await optional("flashcards", "Flashcards", [], () =>
    extracted.requirements.length === 0
      ? Promise.resolve([])
      : generateFlashcards(llm, {
          requirements: extracted.requirements,
          roleTitle: extracted.title,
          seniority: extracted.seniority,
        }),
  );
  const flashcards = cards.map((card, i) => ({ ...card, id: `f${i + 1}` }));

  // 8. The schedule is arithmetic, not a prompt.
  const schedule = await step("schedule", async () =>
    buildSchedule({
      questions: draft.questions,
      requirements: extracted.requirements,
      days: input.days,
    }),
  );

  // 9. Assemble and validate before anything is saved.
  emit("validate", "started");
  const kit = {
    source: {
      company: companyName,
      company_url: input.companyUrl.trim(),
      role: extracted.title,
      location: extracted.location,
      jd_chars: input.jd.length,
      researched_at: now().toISOString(),
      pages_used: [
        ...new Set([
          ...brief.sources,
          ...signals.sources,
          ...discussion.snippets.map((s) => s.url),
        ]),
      ],
    },
    company_brief: {
      summary: brief.summary,
      what_they_do: brief.what_they_do,
      sources: brief.sources,
    },
    role: {
      title: extracted.title,
      seniority: extracted.seniority,
      responsibilities: extracted.responsibilities,
      requirements: extracted.requirements,
    },
    questions: draft.questions,
    flashcards,
    schedule,
    coverage: {
      uncovered_requirement_ids: draft.uncoveredIds,
      passes: draft.passes,
      history: draft.history,
    },
    warnings: [...extracted.warnings, ...warnings],
    research: {
      skipped_sources: skippedSources,
      hiring_page_found: crawl.hiringPageFound,
      public_discussion_found: discussion.found,
      jd_thin: extracted.thin,
      hiring_process: { found: signals.found, stages: signals.stages, sources: signals.sources },
      discussion: discussion.snippets,
    },
  };

  const parsed = kitSchema.safeParse(kit);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new PipelineError(`The generated kit failed validation: ${issues}`, "KIT_INVALID");
  }

  // Check that every must-have requirement is not only covered by a question,
  // but that its question is also scheduled for study
  const unscheduled = mustNotScheduled(
    parsed.data.role.requirements,
    parsed.data.questions,
    parsed.data.schedule,
  );
  if (unscheduled.length > 0) {
    throw new PipelineError(
      `Must-have requirements missing from the schedule: ${unscheduled.join(", ")}`,
      "KIT_INVALID",
    );
  }
  emit("validate", "done");

  return parsed.data;
}
