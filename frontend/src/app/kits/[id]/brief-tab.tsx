import type { Kit } from "@/lib/types";

export function BriefTab({ kit }: { kit: Kit }) {
  return (
    <div className="space-y-6">
      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="font-medium text-neutral-900">{kit.source.company || "Company"}</h2>
        <p className="mt-1 text-sm text-neutral-700">{kit.company_brief.summary}</p>
        <p className="mt-1 text-xs text-neutral-500">{kit.company_brief.what_they_do}</p>
      </section>

      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="font-medium text-neutral-900">
          {kit.role.title} · {kit.role.seniority || "level not specified"}
        </h2>
        {kit.role.responsibilities.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm text-neutral-700">
            {kit.role.responsibilities.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 font-medium text-neutral-900">Requirements</h2>
        <ul className="space-y-1">
          {kit.role.requirements.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm text-neutral-700">
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${r.priority === "must" ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-600"}`}
              >
                {r.priority}
              </span>
              {r.text}
              {kit.coverage.uncovered_requirement_ids.includes(r.id) && (
                <span className="text-xs text-red-500">no question yet</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {kit.research.hiring_process.found && (
        <section className="rounded border border-neutral-200 bg-white p-4">
          <h2 className="mb-2 font-medium text-neutral-900">How they interview</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-700">
            {kit.research.hiring_process.stages.map((s, i) => (
              <li key={i}>
                <strong>{s.name}</strong> — {s.description}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
