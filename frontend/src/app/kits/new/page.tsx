"use client";

import { RequireUser } from "@/components/require-user";
import { TopBar } from "@/components/top-bar";
import { api, ApiRequestError } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";

type Case = { jd: string; company_url: string; days: number };

export default function NewKitPage() {
  const [jd, setJd] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [days, setDays] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const router = useRouter();

  const submitOne = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.post<{ id: string; status: string }>("v1/kits", {
        jd,
        company_url: companyUrl,
        days,
      });
      router.push(`/kits/${id}`);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Something went wrong.");
      setBusy(false);
    }
  };

  const onFile = async (file: File): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const cases = JSON.parse(await file.text()) as Case[];
      if (!Array.isArray(cases))
        throw new Error("File must contain a JSON array of {jd, company_url, days}.");
      let done = 0;
      for (const c of cases) {
        await api.post("v1/kits", c);
        done += 1;
        setBatchStatus(`Submitted ${done} / ${cases.length}`);
      }
      router.push("/kits");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <RequireUser>
      <TopBar />
      <main className="mx-auto max-w-2xl space-y-6 p-6">
        <h1 className="text-lg font-semibold text-neutral-900">New kit</h1>

        <div className="space-y-3 rounded border border-neutral-200 bg-white p-4">
          <label className="block text-sm text-neutral-700">
            Job description
            <textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              rows={10}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
            />
          </label>
          <label className="block text-sm text-neutral-700">
            Company website
            <input
              value={companyUrl}
              onChange={(e) => setCompanyUrl(e.target.value)}
              placeholder="https://acme.com"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
            />
          </label>
          <label className="block text-sm text-neutral-700">
            Days until interview
            <input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="mt-1 w-32 rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            disabled={busy || jd.trim() === ""}
            onClick={() => void submitOne()}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Starting…" : "Generate kit"}
          </button>
        </div>

        <div className="space-y-2 rounded border border-neutral-200 bg-white p-4">
          <p className="text-sm font-medium text-neutral-900">
            Or prepare for several roles at once
          </p>
          <p className="text-xs text-neutral-500">
            Upload a JSON file: an array of {"{ jd, company_url, days }"}.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            disabled={busy}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setFileName(f.name);
                void onFile(f);
              }
            }}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className="rounded border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
            >
              Choose file
            </button>
            <span className="text-sm text-neutral-500">{fileName ?? "No file chosen"}</span>
          </div>

          {batchStatus && <p className="text-xs text-neutral-600">{batchStatus}</p>}
        </div>
      </main>
    </RequireUser>
  );
}
