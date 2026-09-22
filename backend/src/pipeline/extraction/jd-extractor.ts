import { z } from "zod";
import { REQUIREMENT_KINDS, REQUIREMENT_PRIORITIES, type Requirement } from "../kit.schema.js";
import type { JsonLlm } from "../llm/port.js";
import { fenceUntrusted, UNTRUSTED_NOTICE } from "../security/untrusted.js";
import { normalizeForMatch, wordCount } from "../text/normalize.js";

const MAX_JD_CHARS = 6_000;
const MAX_REQUIREMENTS = 20;
const MAX_RESPONSIBILITIES = 8;
const THIN_WORD_LIMIT = 25;
const THIN_REQUIREMENT_LIMIT = 3;
const MIN_EVIDENCE_CHARS = 6;

export type ExtractedJd = {
  title: string;
  company: string;
  seniority: string;
  location: string;
  responsibilities: string[];
  requirements: Requirement[];
  thin: boolean; // True when the posting is too short or too vague to support a full kit
  warnings: string[];
};

const modelOutputSchema = z.object({
  title: z.string(),
  company: z.string(),
  seniority: z.string(),
  location: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(
    z.object({
      text: z.string(),
      kind: z.enum(REQUIREMENT_KINDS),
      priority: z.enum(REQUIREMENT_PRIORITIES),
      evidence: z.string(),
    }),
  ),
});

const SYSTEM_PROMPT = `You extract structured facts from a job posting.
${UNTRUSTED_NOTICE}

Rules:
- Report only what the posting actually says. Never add requirements that are typical for the role but not written in the posting. If the posting is short or vague, return few items, or none.
- "requirements" are skills, experience, qualifications or traits the candidate needs. Keep each "text" under 15 words. Split a line into several requirements only when it names clearly separate skills.
- "kind": "technical" for tools, languages, systems and engineering skills; "behavioural" for collaboration, mentoring, communication and ownership; "domain" for industry or product-area knowledge.
- "priority": "must" when the posting presents it as required, minimum or expected; "nice" when it is a bonus, preferred, a plus, or nice to have.
- "evidence": an exact quote copied from the posting, at most 25 words, taken from a single line. Do not paraphrase or fix typos.
- "responsibilities": what the person will do, one short phrase each, at most ${MAX_RESPONSIBILITIES}.
- "title", "company", "seniority" (junior, mid, senior, staff, lead), "location": use an empty string when the posting does not say.`;

// must / nice: how the posting words it
const NICE_RE =
  /\b(nice[- ]to[- ]haves?|bonus(?:es| points)?|(?:is |are )?a plus|preferred|desirable|good to have|extra credit|would be (?:great|nice|a plus)|not required|optional)\b/i;
const MUST_RE =
  /\b(required|requirements?|must[- ]haves?|must|minimum qualifications|essential|mandatory|you have|you bring|what you(?:['’]?ll| will) need)\b/i;
const BULLET_RE = /^\s*(?:[-*•·▪‣]|\d+[.)])\s+/;
const HEADING_WORDS_RE =
  /requirements?|qualifications?|responsibilities|nice to have|bonus|preferred|what you|who you|about you|skills|you have|you bring|must have|looking for/i;

// Nearest heading-like line above `index`: short, not a bullet, ends with ":" or names a section.
function nearestHeading(lines: readonly string[], index: number): string {
  for (let i = index - 1; i >= Math.max(0, index - 15); i--) {
    const raw = (lines[i] ?? "").trim();
    if (!raw || raw.length > 60 || BULLET_RE.test(raw)) {
      continue;
    }

    const line = raw.replace(/^#+\s*/, "").replace(/[*_]/g, "");
    if (line.endsWith(":") || HEADING_WORDS_RE.test(line)) {
      return line;
    }
  }
  return "";
}

function resolvePriority(
  model: Requirement["priority"],
  heading: string,
  evidence: string,
): Requirement["priority"] {
  if (NICE_RE.test(heading) || NICE_RE.test(evidence)) return "nice";
  if (MUST_RE.test(heading) || MUST_RE.test(evidence)) return "must";
  return model;
}

export async function extractJobDescription(llm: JsonLlm, jd: string): Promise<ExtractedJd> {
  const warnings: string[] = [];
  const text = jd.slice(0, MAX_JD_CHARS);
  if (jd.length > MAX_JD_CHARS) {
    warnings.push(
      `The job description is longer than ${MAX_JD_CHARS} characters; only the first ${MAX_JD_CHARS} were analysed.`,
    );
  }

  const firstLine =
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) ?? "";

  if (text.trim() === "") {
    return {
      title: "",
      company: "",
      seniority: "",
      location: "",
      responsibilities: [],
      requirements: [],
      thin: true,
      warnings: ["The job description is empty, so no requirements could be extracted."],
    };
  }

  const raw = await llm.completeJson({
    system: SYSTEM_PROMPT,
    user: fenceUntrusted("job_posting", text),
    schema: modelOutputSchema,
    schemaName: "job_posting_extraction",
    maxTokens: 2500,
  });

  const jdNormalized = normalizeForMatch(text);
  const lines = text.split(/\r?\n/);
  const normalizedLines = lines.map(normalizeForMatch);

  const seen = new Set<string>();
  const accepted: Omit<Requirement, "id">[] = [];
  let dropped = 0;

  for (const candidate of raw.requirements) {
    const requirementText = candidate.text.trim().slice(0, 160);
    const evidence = normalizeForMatch(candidate.evidence);

    // The anti-invention check: the quote must really be in the posting.
    if (
      !requirementText ||
      evidence.length < MIN_EVIDENCE_CHARS ||
      !jdNormalized.includes(evidence)
    ) {
      dropped++;
      continue;
    }

    const key = normalizeForMatch(requirementText);
    if (seen.has(key)) continue;
    seen.add(key);

    const lineIndex = normalizedLines.findIndex((line) => line.includes(evidence));
    const heading = lineIndex >= 0 ? nearestHeading(lines, lineIndex) : "";

    accepted.push({
      text: requirementText,
      kind: candidate.kind,
      priority: resolvePriority(candidate.priority, heading, candidate.evidence),
    });
  }

  if (dropped > 0) {
    warnings.push(
      `${dropped} requirement${dropped === 1 ? " was" : "s were"} discarded because the supporting quote was not found in the posting.`,
    );
  }

  // Must-haves first, so they win when the list has to be capped and read first in the kit.
  const ordered = [
    ...accepted.filter((r) => r.priority === "must"),
    ...accepted.filter((r) => r.priority === "nice"),
  ];
  if (ordered.length > MAX_REQUIREMENTS) {
    warnings.push(`Only the first ${MAX_REQUIREMENTS} requirements were kept.`);
  }
  const requirements: Requirement[] = ordered
    .slice(0, MAX_REQUIREMENTS)
    .map((r, i) => ({ id: `r${i + 1}`, ...r }));

  const words = wordCount(text);
  const thin = words < THIN_WORD_LIMIT || requirements.length < THIN_REQUIREMENT_LIMIT;
  if (words < THIN_WORD_LIMIT) {
    warnings.push(
      "The job description is very short. This kit is deliberately thin rather than padded with guessed requirements.",
    );
  } else if (requirements.length < THIN_REQUIREMENT_LIMIT) {
    warnings.push(
      `Only ${requirements.length} requirement${requirements.length === 1 ? "" : "s"} could be identified in the posting.`,
    );
  }

  return {
    title: raw.title.trim() || (firstLine.length <= 80 ? firstLine : ""),
    company: raw.company.trim(),
    seniority: raw.seniority.trim().toLowerCase(),
    location: raw.location.trim(),
    responsibilities: raw.responsibilities
      .map((r) => r.trim().slice(0, 160))
      .filter(Boolean)
      .slice(0, MAX_RESPONSIBILITIES),
    requirements,
    thin,
    warnings,
  };
}
