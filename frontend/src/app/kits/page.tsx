"use client";

import { RequireUser } from "@/components/require-user";
import { useAuth } from "@/lib/auth-context";

export default function KitsPage() {
  const { user } = useAuth();
  return (
    <RequireUser>
      <main className="p-6">
        <p>Signed in as {user?.email}. Kit list goes here next.</p>
      </main>
    </RequireUser>
  );
}
