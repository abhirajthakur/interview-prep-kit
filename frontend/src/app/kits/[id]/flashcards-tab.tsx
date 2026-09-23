"use client";

import { useState } from "react";
import { EditableText, EditableTextarea } from "@/components/editable";
import { RequirementChips } from "@/components/requirement-chip";
import { api } from "@/lib/api";
import type { Flashcard, Kit } from "@/lib/types";

export function FlashcardsTab({ kit, setKit }: { kit: Kit; setKit: (k: Kit) => void }) {
  const [regenerating, setRegenerating] = useState(false);
  const [adding, setAdding] = useState(false);

  const patch = async (id: string, p: Partial<Flashcard>): Promise<void> => {
    setKit(await api.patch<Kit>(`v1/kits/${kit._id}/flashcards/${id}`, p));
  };
  const del = async (id: string): Promise<void> => {
    setKit(await api.delete<Kit>(`v1/kits/${kit._id}/flashcards/${id}`));
  };
  const regenerate = async (): Promise<void> => {
    setRegenerating(true);
    try {
      setKit(
        await api.post<Kit>(`v1/kits/${kit._id}/regenerate`, {
          section: "flashcards",
          version: kit.version,
        }),
      );
    } finally {
      setRegenerating(false);
    }
  };
  const add = async (front: string, back: string): Promise<void> => {
    setKit(
      await api.post<Kit>(`v1/kits/${kit._id}/flashcards`, { front, back, requirement_ids: [] }),
    );
    setAdding(false);
  };

  return (
    <div className="rounded border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium text-neutral-900">Flashcards ({kit.flashcards.length})</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setAdding((a) => !a)}
            className="text-xs text-neutral-600 underline hover:text-neutral-900"
          >
            + Add
          </button>
          <button
            disabled={regenerating}
            onClick={() => void regenerate()}
            className="text-xs text-blue-600 underline hover:text-blue-800 disabled:opacity-50 disabled:hover:text-blue-600"
          >
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      </div>

      {adding && <AddFlashcardForm onAdd={add} onCancel={() => setAdding(false)} />}

      <ul className="grid gap-3 sm:grid-cols-2">
        {kit.flashcards.map((f) => (
          <li key={f.id} className="rounded border border-neutral-100 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs text-neutral-400">
              {f.origin === "manual" && (
                <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-700">manual</span>
              )}
              {f.edited && (
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">edited</span>
              )}
              <button
                onClick={() => void del(f.id)}
                className="ml-auto cursor-pointer text-red-500 hover:text-red-700"
              >
                Delete
              </button>
            </div>
            <EditableText
              key={`${f.id}-front`}
              initial={f.front}
              onSave={(v) => void patch(f.id, { front: v })}
            />
            <EditableTextarea
              key={`${f.id}-back`}
              initial={f.back}
              rows={2}
              className="mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-600"
              onSave={(v) => void patch(f.id, { back: v })}
            />
            <div className="mt-1">
              <RequirementChips ids={f.requirement_ids} requirements={kit.role.requirements} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddFlashcardForm({
  onAdd,
  onCancel,
}: {
  onAdd: (front: string, back: string) => void;
  onCancel: () => void;
}) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  return (
    <div className="mb-3 space-y-2 rounded border border-neutral-200 bg-neutral-50 p-3">
      <input
        placeholder="Front"
        value={front}
        onChange={(e) => setFront(e.target.value)}
        className="w-full rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
      />
      <textarea
        placeholder="Back"
        value={back}
        onChange={(e) => setBack(e.target.value)}
        rows={2}
        className="w-full rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
      />
      <div className="flex gap-2">
        <button
          disabled={!front.trim() || !back.trim()}
          onClick={() => onAdd(front, back)}
          className="rounded bg-neutral-900 px-3 py-1 text-xs text-white hover:bg-neutral-700 disabled:opacity-50 disabled:hover:bg-neutral-900"
        >
          Save
        </button>
        <button onClick={onCancel} className="text-xs text-neutral-500 hover:text-neutral-800">
          Cancel
        </button>
      </div>
    </div>
  );
}
