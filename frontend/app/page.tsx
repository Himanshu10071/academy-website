"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import styles from "./page.module.css";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let browserClient: SupabaseClient | undefined;

type Profile = { name: string; email: string };
type AccountResult = { token: string; profile?: Profile; error?: string };

export default function HomePage() {
  const [client, setClient] = useState<SupabaseClient>();
  const [token, setToken] = useState<string | null | undefined>();
  const [account, setAccount] = useState<AccountResult>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!supabaseUrl || !supabaseKey) {
      setError("Configure Supabase to enable Google sign-in.");
      return;
    }

    try {
      const callback = new URL(window.location.href);
      if (callback.searchParams.has("error") || new URLSearchParams(callback.hash.slice(1)).has("error")) {
        setError("Google sign-in did not finish. Please try again.");
        window.history.replaceState(null, "", callback.pathname);
      }

      browserClient ??= createClient(supabaseUrl, supabaseKey, { auth: { flowType: "pkce" } });
      setClient(browserClient);
      const { data: { subscription } } = browserClient.auth.onAuthStateChange((_event, session) => {
        setToken(session?.access_token ?? null);
      });
      return () => subscription.unsubscribe();
    } catch {
      setError("Check the Supabase configuration to enable Google sign-in.");
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();

    async function loadAccount(accessToken: string) {
      try {
        const response = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok) {
          const { profile } = await response.json() as { profile: Profile };
          if (!controller.signal.aborted) setAccount({ token: accessToken, profile });
          return;
        }
        if (!controller.signal.aborted) {
          const message = response.status === 403
            ? "This account cannot access the academy."
            : response.status === 401
              ? "Your session expired. Sign out and try again."
              : "Could not load your account. Please try again.";
          setAccount({ token: accessToken, error: message });
        }
      } catch {
        if (!controller.signal.aborted) {
          setAccount({ token: accessToken, error: "Could not load your account. Please try again." });
        }
      }
    }

    void loadAccount(token);
    return () => controller.abort();
  }, [token, retry]);

  async function signIn() {
    if (!client) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: new URL("/", window.location.origin).href },
      });
      if (!error) return;
    } catch {
      // The same message covers network and provider errors.
    }
    setError("Could not start Google sign-in. Please try again.");
    setBusy(false);
  }

  async function signOut() {
    if (!client) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
      setAccount(undefined);
    } catch {
      setError("Could not sign out. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const currentAccount = account?.token === token ? account : undefined;
  const profile = currentAccount?.profile;
  const initials = profile?.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("");

  return (
    <main className={styles.screen}>
      <section className={styles.panel} aria-labelledby="account-heading">
        <header className={styles.banner}>
          <span className={styles.mark} aria-hidden="true">A</span>
          <span>Academy Website</span>
        </header>
        <div className={styles.content}>
          <h1 id="account-heading">{token ? "Your academy account" : "Sign in to the academy"}</h1>
          {!token && <p className={styles.description}>Use your Google account to access your recorded courses.</p>}
          {profile && (
            <div className={styles.profile}>
              <span className={styles.avatar} aria-hidden="true">{initials?.toLocaleUpperCase()}</span>
              <dl className={styles.details}>
                <div>
                  <dt>Name</dt>
                  <dd>{profile.name}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{profile.email}</dd>
                </div>
              </dl>
            </div>
          )}
          {token && !currentAccount && <p className={styles.description} role="status">Checking your account…</p>}
          {(error || currentAccount?.error) && <p className={styles.alert} role="alert">{error || currentAccount?.error}</p>}
          {token ? (
            <div className={styles.actions}>
              {currentAccount?.error && (
                <button className={styles.primary} type="button" disabled={busy} onClick={() => {
                  setAccount(undefined);
                  setRetry((value) => value + 1);
                }}>Retry</button>
              )}
              <button className={styles.secondary} type="button" disabled={busy} onClick={signOut}>
                {busy ? "Signing out…" : "Sign out"}
              </button>
            </div>
          ) : (
            <button className={styles.google} type="button" disabled={!client || token === undefined || busy} onClick={signIn}>
              {busy ? "Opening Google…" : "Continue with Google"}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
