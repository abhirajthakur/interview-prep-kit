import { z } from "zod";

export const REQUIREMENT_KINDS = ["technical", "behavioural", "domain"] as const;
export const REQUIREMENT_PRIORITIES = ["must", "nice"] as const;
export const QUESTION_CATEGORIES = [
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
] as const;

// Extension: per-item state used by the builder. Optional so raw pipeline output is valid.
const itemState = {
  origin: z.enum(["generated", "manual"]).optional(),
  edited: z.boolean().optional(),
  pinned: z.boolean().optional(),
};

export const requirementSchema = z.object({
  id: z.string().regex(/^r\d+$/),
  text: z.string().min(1),
  kind: z.enum(REQUIREMENT_KINDS),
  priority: z.enum(REQUIREMENT_PRIORITIES),
});

export const questionSchema = z.object({
  id: z.string().regex(/^q\d+$/),
  requirement_ids: z.array(z.string()), // may be empty for pure company-fit questions
  category: z.enum(QUESTION_CATEGORIES),
  prompt: z.string().min(1),
  answer_outline: z.string(),
  difficulty: z.number().int().min(1).max(3),
  ...itemState,
});

export const flashcardSchema = z.object({
  id: z.string().regex(/^f\d+$/),
  front: z.string().min(1),
  back: z.string().min(1),
  requirement_ids: z.array(z.string()),
  ...itemState,
});

export const scheduleDaySchema = z.object({
  day: z.number().int().min(1),
  focus: z.string(),
  question_ids: z.array(z.string()),
  minutes: z.number().int().nonnegative(),
});

const DEFAULT_RESEARCH = {
  skipped_sources: [],
  hiring_page_found: false,
  public_discussion_found: false,
  jd_thin: false,
  hiring_process: { found: false, stages: [], sources: [] },
  discussion: [],
};

export const kitSchema = z
  .object({
    source: z.object({
      company: z.string(),
      company_url: z.string(), // may be invalid input; recorded as given
      role: z.string(),
      location: z.string(),
      jd_chars: z.number().int().nonnegative(),
      researched_at: z.string(),
      pages_used: z.array(z.string()),
    }),
    company_brief: z.object({
      summary: z.string(),
      what_they_do: z.string(),
      sources: z.array(z.string()),
    }),
    role: z.object({
      title: z.string(),
      seniority: z.string(),
      responsibilities: z.array(z.string()),
      requirements: z.array(requirementSchema),
    }),
    questions: z.array(questionSchema),
    flashcards: z.array(flashcardSchema),
    schedule: z.object({
      days_available: z.number().int().min(1),
      days: z.array(scheduleDaySchema),
    }),
    coverage: z.object({
      uncovered_requirement_ids: z.array(z.string()),
      passes: z.number().int().min(0),
    }),

    // Extensions: honest reporting of what could not be found.
    warnings: z.array(z.string()).default([]),
    research: z
      .object({
        skipped_sources: z.array(z.object({ url: z.string(), reason: z.string() })),
        hiring_page_found: z.boolean(),
        public_discussion_found: z.boolean(),
        jd_thin: z.boolean(),
        hiring_process: z.object({
          found: z.boolean(),
          stages: z.array(z.object({ name: z.string(), description: z.string() })),
          sources: z.array(z.string()),
        }),
        discussion: z.array(z.object({ url: z.string(), title: z.string(), text: z.string() })),
      })
      .default(DEFAULT_RESEARCH),
  })
  .superRefine((kit, ctx) => {
    const issue = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: "custom", message, path });

    const reqIds = new Set<string>();
    kit.role.requirements.forEach((r, i) => {
      if (reqIds.has(r.id)) issue(`Duplicate requirement id ${r.id}`, ["role", "requirements", i]);
      reqIds.add(r.id);
    });

    const qIds = new Set<string>();
    kit.questions.forEach((q, i) => {
      if (qIds.has(q.id)) issue(`Duplicate question id ${q.id}`, ["questions", i]);
      qIds.add(q.id);
      q.requirement_ids.forEach((rid) => {
        if (!reqIds.has(rid))
          issue(`Question ${q.id} references unknown requirement ${rid}`, ["questions", i]);
      });
    });

    const fIds = new Set<string>();
    kit.flashcards.forEach((f, i) => {
      if (fIds.has(f.id)) issue(`Duplicate flashcard id ${f.id}`, ["flashcards", i]);
      fIds.add(f.id);
      f.requirement_ids.forEach((rid) => {
        if (!reqIds.has(rid))
          issue(`Flashcard ${f.id} references unknown requirement ${rid}`, ["flashcards", i]);
      });
    });

    const { days, days_available } = kit.schedule;
    if (days.length !== days_available) {
      issue(`Schedule has ${days.length} days but ${days_available} were requested`, [
        "schedule",
        "days",
      ]);
    }
    days.forEach((d, i) => {
      if (d.day !== i + 1)
        issue(`Schedule day numbers must run 1..N in order`, ["schedule", "days", i]);
      d.question_ids.forEach((qid) => {
        if (!qIds.has(qid))
          issue(`Schedule day ${d.day} references unknown question ${qid}`, [
            "schedule",
            "days",
            i,
          ]);
      });
    });

    kit.coverage.uncovered_requirement_ids.forEach((rid, i) => {
      if (!reqIds.has(rid))
        issue(`Uncovered id ${rid} is not a known requirement`, [
          "coverage",
          "uncovered_requirement_ids",
          i,
        ]);
    });
  });

export type Kit = z.infer<typeof kitSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export type Question = z.infer<typeof questionSchema>;
export type Flashcard = z.infer<typeof flashcardSchema>;
