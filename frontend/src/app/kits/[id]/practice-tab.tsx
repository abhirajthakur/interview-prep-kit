"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Kit } from "@/lib/types";

export function PracticeTab({ kit, setKit }: { kit: Kit; setKit: (k: Kit) => void }) {
  const [revealed, setRevealed] = useState(false);

  // Least confident (and never-practiced) first.
  const ordered = useMemo(
    () => [...kit.flashcards].sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0)),
    [kit.flashcards],
  );
  const [index, setIndex] = useState(0);
  const card = ordered[Math.min(index, ordered.length - 1)];
  const covered = kit.flashcards.filter((f) => f.confidence != null).length;

  const rate = async (confidence: number): Promise<void> => {
    if (!card) return;
    setKit(
      await api.patch<Kit>(`v1/kits/${kit._id}/flashcards/${card.id}/practice`, { confidence }),
    );
    setRevealed(false);
    setIndex((i) => (i + 1) % Math.max(1, ordered.length));
  };

  if (kit.flashcards.length === 0)
    return <p className="text-sm text-neutral-500">No flashcards yet.</p>;
  if (!card) return null;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <p className="text-sm text-neutral-500">
        {covered} / {kit.flashcards.length} covered
      </p>
      <div
        onClick={() => setRevealed((r) => !r)}
        className="min-h-40 cursor-pointer rounded border border-neutral-200 bg-white p-6 text-center"
      >
        <p className="text-lg text-neutral-900">{revealed ? card.back : card.front}</p>
        {!revealed && <p className="mt-4 text-xs text-neutral-400">Click to reveal</p>}
      </div>
      {revealed && (
        <div>
          <p className="mb-2 text-center text-xs text-neutral-500">How confident were you?</p>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => void rate(n)}
                className="h-10 w-10 rounded-full border border-neutral-300 text-sm hover:bg-neutral-100"
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
