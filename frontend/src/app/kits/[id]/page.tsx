"use client";

import { KitProgress } from "@/components/kit-progress";
import { RequireUser } from "@/components/require-user";
import { TopBar } from "@/components/top-bar";
import { useKit } from "@/lib/use-kit";
import { use, useState } from "react";
import { BriefTab } from "./brief-tab";
import { FlashcardsTab } from "./flashcards-tab";
import { PracticeTab } from "./practice-tab";
import { QuestionsTab } from "./questions-tab";
import { ScheduleTab } from "./schedule-tab";

const TABS = ["Brief", "Questions", "Flashcards", "Schedule", "Practice"] as const;
type Tab = (typeof TABS)[number];

export default function KitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { kit, setKit, error } = useKit(id);
  const [tab, setTab] = useState<Tab>("Brief");

  return (
    <RequireUser>
      <TopBar />
      <main className="mx-auto max-w-4xl p-6">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!kit && !error && <p className="text-sm text-neutral-500">Loading…</p>}

        {kit && kit.status !== "ready" && <KitProgress kit={kit} />}

        {kit && kit.status === "ready" && (
          <>
            <nav className="mb-4 flex gap-1 border-b border-neutral-200">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-2 text-sm font-medium ${tab === t ? "border-b-2 border-neutral-900 text-neutral-900" : "text-neutral-500 hover:text-neutral-800"}`}
                >
                  {t}
                </button>
              ))}
            </nav>
            {kit.warnings.length > 0 && (
              <ul className="mb-4 space-y-1 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                {kit.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            {tab === "Brief" && <BriefTab kit={kit} />}
            {tab === "Questions" && <QuestionsTab kit={kit} setKit={setKit} />}
            {tab === "Flashcards" && <FlashcardsTab kit={kit} setKit={setKit} />}
            {tab === "Schedule" && <ScheduleTab kit={kit} setKit={setKit} />}
            {tab === "Practice" && <PracticeTab kit={kit} setKit={setKit} />}
          </>
        )}
      </main>
    </RequireUser>
  );
}
