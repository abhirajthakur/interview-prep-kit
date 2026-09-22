import { KitModel, type KitDoc } from "../db/models/kit.model.js";
import { findUncovered, mustNotScheduled } from "../pipeline/coverage/coverage.js";
import { generateCompanyBrief, unavailableBrief } from "../pipeline/generation/company-brief.js";
import {
  regenerateFlashcards,
  regenerateQuestionCategory,
} from "../pipeline/generation/regenerate.js";
import type {
  GenerationContext,
  QuestionCategory,
} from "../pipeline/generation/question-generator.js";
import { kitSchema, type Flashcard, type Kit, type Question } from "../pipeline/kit.schema.js";
import { roleHints } from "../pipeline/research/role-hints.js";
import { crawlCompany } from "../pipeline/retrieval/crawler.js";
import { buildSchedule } from "../pipeline/scheduling/schedule.js";
import { getPipelineServices } from "../lib/pipeline.js";
import { conflict, internalServerError, notFound } from "../utils/api-error.js";
import type { RegenerateSection } from "./kits.schemas.js";

export async function regenerateSection(params: {
  kitId: string;
  ownerId: string;
  section: RegenerateSection;
  expectedVersion: number;
  days?: number | undefined;
}): Promise<KitDoc> {
  const kit = await KitModel.findOne({ _id: params.kitId, ownerId: params.ownerId });
  if (!kit) throw notFound("Kit not found");
  if (kit.status !== "ready") throw conflict("This kit is not ready to be regenerated yet.");
  if (kit.version !== params.expectedVersion) {
    throw conflict("This kit changed since you loaded it. Reload and try again.", {
      currentVersion: kit.version,
    });
  }

  const plain = kit.toObject() as unknown as Kit & { role: Kit["role"] };
  const { llm, fetcher } = getPipelineServices();

  let questions = plain.questions as Question[];
  let flashcards = plain.flashcards as Flashcard[];
  let schedule = plain.schedule;
  let companyBrief = plain.company_brief;
  let extraWarnings: string[] = [];

  if (params.section === "company_brief") {
    const crawl = await crawlCompany(kit.source?.company_url ?? "", fetcher, {
      roleHints: roleHints(kit.role?.title ?? ""),
    });
    const brief = crawl.reachable
      ? await generateCompanyBrief(llm, {
          companyName: kit.source?.company ?? "",
          pages: crawl.pages,
        })
      : unavailableBrief(kit.source?.company ?? "");
    companyBrief = {
      summary: brief.summary,
      what_they_do: brief.what_they_do,
      sources: brief.sources,
    };
  } else if (params.section === "flashcards") {
    flashcards = await regenerateFlashcards(llm, {
      requirements: plain.role.requirements,
      currentFlashcards: flashcards,
      roleTitle: plain.role.title,
      seniority: plain.role.seniority,
    });
  } else if (params.section === "schedule") {
    schedule = buildSchedule({
      questions,
      requirements: plain.role.requirements,
      days: params.days ?? plain.schedule.days_available,
    });
  } else {
    const category = params.section.replace("questions:", "") as QuestionCategory;
    const context: GenerationContext = {
      roleTitle: plain.role.title,
      seniority: plain.role.seniority,
      companyName: plain.source.company,
      companyFacts: [companyBrief.what_they_do].filter(Boolean),
      // Simplification: takeHome/systemDesign/liveCoding/cultureNotes are not persisted, so they default here.
      signals: {
        found: plain.research.hiring_process.found,
        stages: plain.research.hiring_process.stages,
        takeHome: false,
        systemDesign: false,
        liveCoding: false,
        cultureNotes: [],
        sources: plain.research.hiring_process.sources,
      },
    };
    const result = await regenerateQuestionCategory(llm, {
      category,
      allRequirements: plain.role.requirements,
      currentQuestions: questions,
      context,
      thin: plain.research.jd_thin,
    });
    questions = result.questions;
    extraWarnings = result.warnings;
    schedule = buildSchedule({
      questions,
      requirements: plain.role.requirements,
      days: plain.schedule.days_available,
    });
  }

  const uncovered = findUncovered(plain.role.requirements, questions);
  const merged = {
    source: plain.source,
    company_brief: companyBrief,
    role: plain.role,
    questions,
    flashcards,
    schedule,
    coverage: {
      uncovered_requirement_ids: uncovered,
      passes: plain.coverage.passes,
      history: plain.coverage.history,
    },
    warnings: [...plain.warnings, ...extraWarnings],
    research: plain.research,
  };

  const parsed = kitSchema.safeParse(merged);
  if (!parsed.success) {
    throw internalServerError(
      "Regeneration produced an invalid kit.",
      parsed.error.issues.slice(0, 3),
    );
  }
  const unscheduled = mustNotScheduled(
    parsed.data.role.requirements,
    parsed.data.questions,
    parsed.data.schedule,
  );
  if (unscheduled.length > 0)
    throw internalServerError("Regeneration left must-have requirements unscheduled.");

  const updated = await KitModel.findOneAndUpdate(
    { _id: kit._id, version: params.expectedVersion },
    {
      $set: {
        company_brief: companyBrief,
        questions,
        flashcards,
        schedule,
        coverage: merged.coverage,
        warnings: merged.warnings,
      },
      $inc: { version: 1 },
    },
    { new: true },
  );
  if (!updated) throw conflict("This kit changed since you loaded it. Reload and try again.");
  return updated;
}
