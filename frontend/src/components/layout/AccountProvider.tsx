"use client";

import type { Profile, UpdateProfile } from "@academy/shared";
import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { getMe, updateMe } from "../../lib/api/me";
import { profileError } from "../../lib/errors";
import { getSupabaseBrowser } from "../../lib/supabase-browser";
import { ProfileForm } from "./ProfileForm";

type Account = {
  profile?: Profile;
  token?: string;
  userId?: string;
  accountError: string;
  signedIn: boolean;
  ready: boolean;
  busy: boolean;
  signIn: (returnTo?: string) => Promise<void>;
  logout: () => Promise<void>;
  edit: (mode: "phone" | "edit") => void;
};

const AccountContext = createContext<Account | null>(null);
const googleReturnKey = "prince-academy:google-course-return";
const coursePath = /^\/courses\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

function rememberGoogleReturn(path?: string) {
  try {
    if (path && path.length <= 189 && coursePath.test(path)) sessionStorage.setItem(googleReturnKey, path);
    else sessionStorage.removeItem(googleReturnKey);
  } catch {
    // Google sign-in can still return to the homepage without session storage.
  }
}

function takeGoogleReturn() {
  try {
    const path = sessionStorage.getItem(googleReturnKey);
    sessionStorage.removeItem(googleReturnKey);
    if (path && path.length <= 189 && coursePath.test(path)) return path;
  } catch {
    // The homepage is the fallback.
  }
}

export function useAccount() {
  const account = useContext(AccountContext);
  if (!account) throw new Error("AccountProvider is required.");
  return account;
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>();
  const [profile, setProfile] = useState<Profile>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(false);
  const [mode, setMode] = useState<"phone" | "edit">();
  const sessionId = useRef<string | null>(null);
  const prompted = useRef(new Set<string>());
  const token = session?.access_token;

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("error") || new URLSearchParams(url.hash.slice(1)).has("error")) {
        rememberGoogleReturn();
        setError("Google sign-in did not finish. Please try again.");
        window.history.replaceState(null, "", url.pathname);
      }
      const { data: { subscription } } = getSupabaseBrowser().auth.onAuthStateChange((_event, next) => {
        const nextId = next?.user.id ?? null;
        if (sessionId.current !== nextId) {
          sessionId.current = nextId;
          setProfile(undefined);
          setMode(undefined);
          setToast(false);
          if (nextId) setError("");
        }
        setSession(next);
        if (next && window.location.pathname === "/") {
          const path = takeGoogleReturn();
          if (path) window.location.replace(path);
        }
      });
      return () => subscription.unsubscribe();
    } catch {
      setError("Google sign-in is unavailable.");
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void getMe(token, controller.signal).then((me) => {
      if (controller.signal.aborted || sessionId.current !== me.id) return;
      setProfile(me);
      setError("");
      if (me.phone?.trim() || prompted.current.has(me.id)) return;
      prompted.current.add(me.id);
      try {
        const key = `prince-academy:profile-prompt:${me.id}`;
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, "shown");
      } catch {
        // The in-memory record still prevents repeat prompts during this visit.
      }
      setToast(true);
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      setProfile(undefined);
      setMode(undefined);
      setToast(false);
      setError(profileError(failure, "Could not load your profile. Please try signing in again."));
    });
    return () => controller.abort();
  }, [token]);

  async function signIn(returnTo?: string) {
    setBusy(true);
    setError("");
    rememberGoogleReturn(returnTo);
    try {
      const { error } = await getSupabaseBrowser().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: new URL("/", window.location.origin).href },
      });
      if (!error) return;
    } catch {
      // Show the same message for configuration, provider, and network errors.
    }
    rememberGoogleReturn();
    setError("Could not start Google sign-in. Please try again.");
    setBusy(false);
  }

  async function logout() {
    setBusy(true);
    setError("");
    try {
      const { error } = await getSupabaseBrowser().auth.signOut({ scope: "local" });
      if (error) throw error;
    } catch {
      setError("Could not log out. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function edit(next: "phone" | "edit") {
    setToast(false);
    setMode(next);
  }

  async function save(updates: UpdateProfile, signal: AbortSignal) {
    if (!token) return;
    const me = await updateMe(token, updates, signal);
    if (signal.aborted || sessionId.current !== me.id) return;
    setProfile(me);
    setToast(false);
    setMode(undefined);
  }

  return (
    <AccountContext.Provider value={{ profile, token, userId: session?.user.id, accountError: error, signedIn: Boolean(session), ready: session !== undefined, busy, signIn, logout, edit }}>
      {children}
      {error && <p className="account-notice" role="alert">{error}</p>}
      {session && !profile && !error && <p className="account-notice" role="status">Checking your account…</p>}
      {toast && !mode && profile && (
        <aside className="profile-toast" aria-label="Complete your profile">
          <p role="status"><strong>Complete your profile</strong><br />Add your phone number before checkout.</p>
          <div className="actions">
            <button className="button button-primary" type="button" onClick={() => edit("phone")}>Add phone number</button>
            <button className="button button-secondary" type="button" onClick={() => setToast(false)}>Dismiss</button>
          </div>
        </aside>
      )}
      {mode && profile && <ProfileForm key={mode} mode={mode} profile={profile} save={save} close={() => setMode(undefined)} />}
    </AccountContext.Provider>
  );
}
