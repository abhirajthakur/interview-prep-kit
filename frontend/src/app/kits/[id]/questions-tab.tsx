"use client";

import { useState } from "react";
import { EditableTextarea } from "@/components/editable";
import { RequirementChips } from "@/components/requirement-chip";
import { api } from "@/lib/api";
import type { Kit, Question } from "@/lib/types";

const CATEGORIES: Question["category"][] = [
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
];
const LABEL: Record<Question["category"], string> = {
  technical: "Technical",
  behavioural: "Behavioural",
  "system-design": "System design",
  "company-fit": "Company fit",
};

export function QuestionsTab({ kit, setKit }: { kit: Kit; setKit: (k: Kit) => void }) {
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<Question["category"] | null>(null);

  const patchQuestion = async (id: string, patch: Partial<Question>): Promise<void> => {
    setKit(await api.patch<Kit>(`v1/kits/${kit._id}/questions/${id}`, patch));
  };
  const deleteQuestion = async (id: string): Promise<void> => {
    setKit(await api.delete<Kit>(`v1/kits/${kit._id}/questions/${id}`));
  };
  const moveCategory = async (id: string, category: Question["category"]): Promise<void> => {
    await patchQuestion(id, { category });
  };
  const move = async (category: Question["category"], id: string, dir: -1 | 1): Promise<void> => {
    const inCat = kit.questions.filter((q) => q.category === category).map((q) => q.id);
    const i = inCat.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= inCat.length) return;
    [inCat[i], inCat[j]] = [inCat[j], inCat[i]];
    const others = kit.questions.filter((q) => q.category !== category).map((q) => q.id);
    // Preserve categories' relative block order: rebuild full order by category grouping.
    const full = CATEGORIES.flatMap((c) =>
      c === category ? inCat : kit.questions.filter((q) => q.category === c).map((q) => q.id),
    );
    void others;
    setKit(await api.patch<Kit>(`v1/kits/${kit._id}/questions/order`, { question_ids: full }));
  };
  const regenerate = async (category: Question["category"]): Promise<void> => {
    setRegenerating(category);
    try {
      setKit(
        await api.post<Kit>(`v1/kits/${kit._id}/regenerate`, {
          section: `questions:${category}`,
          version: kit.version,
        }),
      );
    } finally {
      setRegenerating(null);
    }
  };
  const addQuestion = async (
    category: Question["category"],
    form: { prompt: string; answer_outline: string; difficulty: number },
  ): Promise<void> => {
    setKit(
      await api.post<Kit>(`v1/kits/${kit._id}/questions`, {
        category,
        requirement_ids: [],
        ...form,
      }),
    );
    setAddingTo(null);
  };

  return (
    <div className="space-y-6">
      {CATEGORIES.map((category) => {
        const items = kit.questions.filter((q) => q.category === category);
        if (items.length === 0 && category === "system-design") return null;
        return (
          <section key={category} className="rounded border border-neutral-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium text-neutral-900">
                {LABEL[category]} <span className="text-xs text-neutral-400">({items.length})</span>
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setAddingTo(addingTo === category ? null : category)}
                  className="text-xs text-neutral-600 underline hover:text-neutral-900"
                >
                  + Add
                </button>
                <button
                  disabled={regenerating === category}
                  onClick={() => void regenerate(category)}
                  className="text-xs text-blue-600 underline hover:text-blue-800 disabled:opacity-50 disabled:hover:text-blue-600"
                >
                  {regenerating === category ? "Regenerating…" : "Regenerate"}
                </button>
              </div>
            </div>

            {addingTo === category && (
              <AddQuestionForm
                onAdd={(f) => void addQuestion(category, f)}
                onCancel={() => setAddingTo(null)}
              />
            )}

            <ul className="space-y-3">
              {items.map((q, i) => (
                <li key={q.id} className="rounded border border-neutral-100 p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs text-neutral-400">
                    {q.origin === "manual" && (
                      <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-700">
                        manual
                      </span>
                    )}
                    {q.edited && (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">
                        edited
                      </span>
                    )}
                    <span className="ml-auto flex gap-1">
                      <button
                        onClick={() => void move(category, q.id, -1)}
                        disabled={i === 0}
                        className="rounded px-1 hover:bg-neutral-200 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => void move(category, q.id, 1)}
                        disabled={i === items.length - 1}
                        className="rounded px-1 hover:bg-neutral-200 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        ↓
                      </button>
                      <select
                        value={category}
                        onChange={(e) =>
                          void moveCategory(q.id, e.target.value as Question["category"])
                        }
                        className="ml-2 rounded border border-neutral-200 text-xs hover:border-neutral-400"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {LABEL[c]}
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => void deleteQuestion(q.id)}
                        className="ml-2 cursor-pointer text-red-500 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                  <EditableTextarea
                    key={`${q.id}-prompt`}
                    initial={q.prompt}
                    rows={2}
                    onSave={(v) => void patchQuestion(q.id, { prompt: v })}
                  />
                  <EditableTextarea
                    key={`${q.id}-outline`}
                    initial={q.answer_outline}
                    rows={2}
                    className="mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-600"
                    onSave={(v) => void patchQuestion(q.id, { answer_outline: v })}
                  />
                  <div className="mt-1">
                    <RequirementChips
                      ids={q.requirement_ids}
                      requirements={kit.role.requirements}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function AddQuestionForm({
  onAdd,
  onCancel,
}: {
  onAdd: (f: { prompt: string; answer_outline: string; difficulty: number }) => void;
  onCancel: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [outline, setOutline] = useState("");
  return (
    <div className="mb-3 space-y-2 rounded border border-neutral-200 bg-neutral-50 p-3">
      <textarea
        placeholder="Question"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        className="w-full rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
      />
      <textarea
        placeholder="Answer outline"
        value={outline}
        onChange={(e) => setOutline(e.target.value)}
        rows={2}
        className="w-full rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
      />
      <div className="flex gap-2">
        <button
          disabled={!prompt.trim()}
          onClick={() => onAdd({ prompt, answer_outline: outline, difficulty: 2 })}
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
