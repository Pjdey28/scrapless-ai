"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Factory } from "lucide-react";
import { isDemoMode, supabase } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setError("Sign-up requires Supabase Auth. Configure the public Supabase URL and anon key; demo mode does not create accounts.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    const { data, error: authError } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    if (data.session) router.replace("/dashboard");
    else setMessage("Check your email to confirm the new account, then sign in.");
  }

  return (
    <main className="auth-page">
      <aside className="auth-aside">
        <Link href="/" className="brand-lockup"><div className="brand-mark"><Factory size={20} /></div><div><strong>scrapless<span>ai</span></strong><small>Manufacturing intelligence</small></div></Link>
        <div className="auth-message"><p className="eyebrow">ACCOUNT SECURITY</p><h1>Your workspace, your data.</h1><p>Authentication is handled by Supabase. ScrapLess AI never stores or manages passwords directly.</p></div>
        <div className="auth-aside-footer">Saved data is isolated by database Row Level Security policies.</div>
      </aside>
      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <h2>Create your account</h2>
          <p>{isDemoMode ? "Account registration is unavailable in local demo mode." : "Use your work email to create a protected workspace."}</p>
          {!isDemoMode && <>
            <div className="field"><label htmlFor="email">Email address</label><input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
            <div className="field"><label htmlFor="password">Password</label><input id="password" className="input" type="password" minLength={8} autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} /><small>Use at least 8 characters. Supabase enforces the project’s password policy.</small></div>
          </>}
          {error && <div className="notice notice-error" role="alert">{error}</div>}
          {message && <div className="notice notice-success" role="status">{message}</div>}
          {!isDemoMode && <button type="submit" className="btn btn-primary full-width" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>}
          <p className="auth-footnote">Already have an account? <Link href="/login" style={{ color: "#187653" }}>Sign in</Link></p>
        </form>
      </section>
    </main>
  );
}
