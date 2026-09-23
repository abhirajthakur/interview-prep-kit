"use client";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function TopBar() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const onLogout = async (): Promise<void> => {
    await api.post("v1/auth/logout");
    await refresh();
    router.push("/login");
  };
  return (
    <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
      <Link href="/kits" className="font-semibold text-neutral-900">
        Interview Prep Kit
      </Link>
      {user && (
        <div className="flex items-center gap-3 text-sm text-neutral-600">
          <span>{user.email}</span>
          <button
            onClick={() => void onLogout()}
            className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100"
          >
            Log out
          </button>
        </div>
      )}
    </header>
  );
}
