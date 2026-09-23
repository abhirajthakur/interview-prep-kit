"use client";

import { useEffect, useState } from "react";
import { RequireUser } from "@/components/require-user";
import { TopBar } from "@/components/top-bar";
import { api } from "@/lib/api";
import type { Kit } from "@/lib/types";

const STATUS_LABEL: Record<Kit["status"], string> = {
  pending: "Queued",
  generating: "Generating…",
  ready: "Ready",
  failed: "Failed",
};
const STATUS_COLOR: Record<Kit["status"], string> = {
  pending: "bg-neutral-100 text-neutral-600",
  generating: "bg-blue-100 text-blue-700",
  ready: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export default function KitsPage() {
  const [kits, setKits] = useState<Kit[] | null>(null);

  useEffect(() => {
    void api.get<Kit[]>("v1/kits").then(setKits);
  }, []);

  return (
    <RequireUser>
      <TopBar />
      <main className="mx-auto max-w-3xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-900">Your kits</h1>
          <a
            href="/kits/new"
            className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
          >
            New kit
          </a>
        </div>
        {kits === null && <p className="text-sm text-neutral-500">Loading…</p>}
        {kits?.length === 0 && (
          <p className="text-sm text-neutral-500">No kits yet. Create your first one.</p>
        )}
        <ul className="space-y-2">
          {kits?.map((k) => (
            <li key={k._id}>
              <a
                href={`/kits/${k._id}`}
                className="flex items-center justify-between rounded border border-neutral-200 bg-white px-4 py-3 hover:border-neutral-400"
              >
                <div>
                  <p className="font-medium text-neutral-900">
                    {k.role.title || "Untitled role"}
                    {k.source.company ? ` · ${k.source.company}` : ""}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {k.source.researched_at
                      ? new Date(k.source.researched_at).toLocaleString()
                      : "—"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLOR[k.status]}`}
                >
                  {STATUS_LABEL[k.status]}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </main>
    </RequireUser>
  );
}
