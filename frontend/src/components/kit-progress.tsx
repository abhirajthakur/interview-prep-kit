import type { Kit } from "@/lib/types";

const STEP_LABELS: Record<string, string> = {
  extract_requirements: "Reading the job description",
  crawl_site: "Crawling the company site",
  hiring_process: "Looking for how they interview",
  public_discussion: "Searching public discussion",
  company_brief: "Writing the company brief",
  questions: "Writing interview questions",
  flashcards: "Writing flashcards",
  schedule: "Building the study schedule",
  validate: "Checking everything fits",
};

export function KitProgress({ kit }: { kit: Kit }) {
  const started = new Set(kit.progress.filter((p) => p.status === "started").map((p) => p.step));
  const done = new Set(kit.progress.filter((p) => p.status !== "started").map((p) => p.step));
  const steps = Object.keys(STEP_LABELS);

  return (
    <div className="mx-auto max-w-md space-y-3 rounded border border-neutral-200 bg-white p-6">
      <p className="text-sm font-medium text-neutral-900">
        {kit.status === "failed" ? "Generation failed" : "Building your kit…"}
      </p>
      <ul className="space-y-2">
        {steps.map((step) => {
          const state = done.has(step) ? "done" : started.has(step) ? "active" : "pending";
          return (
            <li key={step} className="flex items-center gap-2 text-sm">
              <span
                className={`h-2 w-2 rounded-full ${state === "done" ? "bg-green-500" : state === "active" ? "bg-blue-500 animate-pulse" : "bg-neutral-300"}`}
              />
              <span className={state === "pending" ? "text-neutral-400" : "text-neutral-800"}>
                {STEP_LABELS[step]}
              </span>
            </li>
          );
        })}
      </ul>
      {kit.status === "failed" && kit.error && (
        <p className="text-sm text-red-600">{kit.error.message}</p>
      )}
    </div>
  );
}
