"use client";

import { ROLE } from "@academy/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAccount } from "../layout/AccountProvider";

export function AdminGate({ children }: { children: ReactNode }) {
  const { ready, signedIn, profile, token, accountError } = useAccount();
  const router = useRouter();
  const allowed = Boolean(token && profile?.role === ROLE.ADMIN);
  const denied = (ready && !signedIn) || Boolean(profile && profile.role !== ROLE.ADMIN);

  useEffect(() => {
    if (denied) router.replace("/");
  }, [denied, router]);

  if (!allowed) {
    return <main className="container sections"><p role="status">
      {denied ? "Returning to the homepage…" : accountError || "Checking admin access…"}
    </p></main>;
  }

  return (
    <main className="container admin-main">
      <nav className="actions admin-nav" aria-label="Catalog management">
        <Link className="button button-secondary" href="/admin/teachers">Teachers</Link>
        <Link className="button button-secondary" href="/admin/courses">Courses</Link>
        <Link className="button button-secondary" href="/admin/demos">Demos</Link>
      </nav>
      <div key={profile?.id}>{children}</div>
    </main>
  );
}
