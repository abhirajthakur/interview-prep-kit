import { z } from "zod";

export const createKitSchema = z.object({
  body: z.object({ jd: z.string(), company_url: z.string(), days: z.coerce.number().int() }),
});

export const getKitParamsSchema = z.object({ params: z.object({ id: z.string().min(1) }) });

const SECTIONS = [
  "company_brief",
  "questions:technical",
  "questions:behavioural",
  "questions:system-design",
  "questions:company-fit",
  "flashcards",
  "schedule",
] as const;

export const regenerateKitSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    section: z.enum(SECTIONS),
    version: z.coerce.number().int().min(0),
    days: z.coerce.number().int().optional(),
  }),
});
export type RegenerateSection = (typeof SECTIONS)[number];
