"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Kit } from "@/lib/types";

export function ScheduleTab({ kit, setKit }: { kit: Kit; setKit: (k: Kit) => void }) {
  const [days, setDays] = useState(kit.schedule.days_available);
  const [regenerating, setRegenerating] = useState(false);
  const byId = new Map(kit.questions.map((q) => [q.id, q]));

  const regenerate = async (): Promise<void> => {
    setRegenerating(true);
    try {
      setKit(
        await api.post<Kit>(`v1/kits/${kit._id}/regenerate`, {
          section: "schedule",
          version: kit.version,
          days,
        }),
      );
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded border border-neutral-200 bg-white p-4">
        <label className="text-sm text-neutral-700">
          Days:{" "}
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="ml-1 w-20 rounded border border-neutral-300 px-2 py-1 text-sm"
          />
        </label>
        <button
          disabled={regenerating}
          onClick={() => void regenerate()}
          className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50 disabled:hover:bg-neutral-900"
        >
          {regenerating ? "Rebuilding…" : "Rebuild schedule"}
        </button>
        <p className="text-xs text-neutral-400">
          Edited or deleted a question? Rebuild to keep the schedule accurate.
        </p>
      </div>

      {kit.schedule.days.map((d) => (
        <div key={d.day} className="rounded border border-neutral-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-medium text-neutral-900">
              Day {d.day}: {d.focus}
            </h3>
            <span className="text-xs text-neutral-500">{d.minutes} min</span>
          </div>
          <ul className="space-y-1 text-sm text-neutral-700">
            {d.question_ids.map((id) => (
              <li key={id}>• {byId.get(id)?.prompt ?? "(deleted question)"}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
