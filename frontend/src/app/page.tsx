"use client";

import { useAuth } from "@/lib/auth-context";
import Link from "next/link";

export default function HomePage() {
  const { user, loading } = useAuth();

  return (
    <main className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="font-semibold text-neutral-900">Interview Prep Kit</span>
        {!loading && (
          <nav className="flex items-center gap-3 text-sm">
            {user ? (
              <Link href="/kits" className="rounded bg-neutral-900 px-3 py-2 font-medium text-white hover:bg-neutral-700">
                Go to your kits
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-neutral-600 hover:text-neutral-900">Sign in</Link>
                <Link href="/register" className="rounded bg-neutral-900 px-3 py-2 font-medium text-white hover:bg-neutral-700">
                  Get started
                </Link>
              </>
            )}
          </nav>
        )}
      </header>

      <section className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h1 className="text-3xl font-bold text-neutral-900 sm:text-4xl">
          Turn any job posting into a study plan
        </h1>
        <p className="mt-4 text-neutral-600">
          Paste a job description and a company website. It researches the company, finds how they
          interview, and builds you a company brief, a question bank, flashcards, and a day-by-day
          schedule — all editable, all yours.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          {!loading && !user && (
            <>
              <a href="/register" className="rounded bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700">
                Create a free kit
              </a>
              <a href="/login" className="rounded border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100">
                Sign in
              </a>
            </>
          )}
          {!loading && user && (
            <Link href="/kits" className="rounded bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700">
              Go to your kits
            </Link>
          )}
        </div>
      </section>

      <section className="mx-auto grid max-w-3xl gap-6 px-6 pb-20 sm:grid-cols-3">
        {[
          { title: "Researched", body: "Crawls the company site and public discussion to find how they actually interview." },
          { title: "Generated, checked twice", body: "Questions are checked against every requirement, and gaps are filled before it's done." },
          { title: "Fully editable", body: "Edit, reorder, add, delete, or regenerate any section without losing your own changes." },
        ].map((f) => (
          <div key={f.title} className="rounded border border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-neutral-900">{f.title}</h2>
            <p className="mt-1 text-sm text-neutral-600">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
