export type Requirement = {
  id: string;
  text: string;
  kind: "technical" | "behavioural" | "domain";
  priority: "must" | "nice";
};

export type Question = {
  id: string;
  requirement_ids: string[];
  category: "technical" | "behavioural" | "system-design" | "company-fit";
  prompt: string;
  answer_outline: string;
  difficulty: number;
  origin?: "generated" | "manual";
  edited?: boolean;
  pinned?: boolean;
};

export type Flashcard = {
  id: string;
  front: string;
  back: string;
  requirement_ids: string[];
  origin?: "generated" | "manual";
  edited?: boolean;
  pinned?: boolean;
};

export type ScheduleDay = { day: number; focus: string; question_ids: string[]; minutes: number };

export type ProgressEvent = {
  step: string;
  status: "started" | "done" | "skipped";
  detail?: string;
  at: string;
};

export type Kit = {
  _id: string;
  status: "pending" | "generating" | "ready" | "failed";
  error: { code: string; message: string } | null;
  progress: ProgressEvent[];
  version: number;
  source: {
    company: string;
    company_url: string;
    role: string;
    location: string;
    jd_chars: number;
    researched_at: string;
    pages_used: string[];
  };
  company_brief: { summary: string; what_they_do: string; sources: string[] };
  role: {
    title: string;
    seniority: string;
    responsibilities: string[];
    requirements: Requirement[];
  };
  questions: Question[];
  flashcards: Flashcard[];
  schedule: { days_available: number; days: ScheduleDay[] };
  coverage: {
    uncovered_requirement_ids: string[];
    passes: number;
    history: { pass: number; uncovered_requirement_ids: string[] }[];
  };
  warnings: string[];
  research: {
    skipped_sources: { url: string; reason: string }[];
    hiring_page_found: boolean;
    public_discussion_found: boolean;
    jd_thin: boolean;
    hiring_process: {
      found: boolean;
      stages: { name: string; description: string }[];
      sources: string[];
    };
    discussion: { url: string; title: string; text: string }[];
  };
};

export type User = { id: string; email: string };
