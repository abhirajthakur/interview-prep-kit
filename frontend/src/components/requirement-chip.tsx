import type { Requirement } from "@/lib/types";

export function RequirementChips({
  ids,
  requirements,
}: {
  ids: string[];
  requirements: Requirement[];
}) {
  if (ids.length === 0) {
    return <span className="text-xs text-neutral-400">No linked requirement</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => {
        const r = requirements.find((x) => x.id === id);
        return (
          <span
            key={id}
            className={`rounded-full px-2 py-0.5 text-xs ${r?.priority === "must" ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-600"}`}
          >
            {r?.text ?? id}
          </span>
        );
      })}
    </div>
  );
}
