"use client";

import { api, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { User } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { refresh } = useAuth();
  const router = useRouter();

  const onSubmit = async (e: SubmitEvent): Promise<void> => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post<{ user: User }>(`v1/auth/${mode}`, { email, password });
      await refresh();
      router.push("/kits");
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto mt-24 w-full max-w-sm space-y-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <h1 className="text-lg font-semibold text-neutral-900">
        {mode === "login" ? "Sign in" : "Create an account"}
      </h1>
      <label className="block text-sm text-neutral-700">
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none"
        />
      </label>
      <label className="block text-sm text-neutral-700">
        Password
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
      <p className="text-center text-sm text-neutral-500">
        {mode === "login" ? (
          <>
            No account?{" "}
            <a href="/register" className="underline">
              Register
            </a>
          </>
        ) : (
          <>
            Have an account?{" "}
            <a href="/login" className="underline">
              Sign in
            </a>
          </>
        )}
      </p>
    </form>
  );
}
