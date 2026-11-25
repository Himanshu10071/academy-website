"use client";

import { ROLE } from "@academy/shared";
import Link from "next/link";

import { useAccount } from "./AccountProvider";

export function GoogleSignIn({ primary = false }: { primary?: boolean }) {
  const { signedIn, ready, busy, signIn } = useAccount();
  if (signedIn) return null;

  return (
    <button className={`button ${primary ? "button-primary" : "button-secondary"}`}
      type="button" disabled={!ready || busy} onClick={() => void signIn()}>
      {busy ? "Opening Google…" : "Sign in with Google"}
    </button>
  );
}

export function AcademyHeader() {
  const { profile, signedIn, busy, logout, edit } = useAccount();

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="wordmark" href="/">Prince Academy</Link>
        {signedIn ? (
          <div className="account-actions">
            {profile && <>
              <span className="account-name">{profile.name}</span>
              <Link className="button button-quiet" href="/my-courses">My Courses</Link>
              {profile.role === ROLE.ADMIN && <Link className="button button-quiet" href="/admin">Manage catalog</Link>}
              <button className="button button-quiet" type="button" onClick={() => edit(profile.phone?.trim() ? "edit" : "phone")}>
                {profile.phone?.trim() ? "Edit profile" : "Add phone number"}
              </button>
              {!profile.phone?.trim() && <button className="button button-quiet" type="button" onClick={() => edit("edit")}>Edit profile</button>}
            </>}
            <button className="button button-secondary" type="button" disabled={busy} onClick={logout}>Logout</button>
          </div>
        ) : <GoogleSignIn />}
      </div>
    </header>
  );
}
