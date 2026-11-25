"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Factory } from "lucide-react";
import { isDemoMode, supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      router.push("/dashboard");
      return;
    }
    setBusy(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    router.replace("/dashboard");
  }

  return (
    <main className="auth-page">
      <aside className="auth-aside">
        <Link href="/" className="brand-lockup"><div className="brand-mark"><Factory size={20} /></div><div><strong>scrapless<span>ai</span></strong><small>Manufacturing intelligence</small></div></Link>
        <div className="auth-message"><p className="eyebrow">PLAN WITH CONFIDENCE</p><h1>Make every sheet count.</h1><p>Validate your cut plans, compare strategies, and see the assumptions behind every material metric.</p></div>
        <div className="auth-aside-footer">Rectangular cutting optimization · ScrapLess AI</div>
      </aside>
      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <h2>Welcome back</h2>
          <p>{isDemoMode ? "Demo mode is active. Open the dashboard without an account." : "Sign in to access your protected production orders and analysis history."}</p>
          {!isDemoMode && <>
            <div className="field"><label htmlFor="email">Email address</label><input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
            <div className="field"><label htmlFor="password">Password</label><input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          </>}
          {error && <div className="notice notice-error" role="alert">{error}</div>}
          <button type="submit" className="btn btn-primary full-width" disabled={busy}>{busy ? "Signing in…" : isDemoMode ? "Continue to demo" : "Sign in"}</button>
          {!isDemoMode && <p className="auth-footnote">New to ScrapLess AI? <Link href="/signup" style={{ color: "#187653" }}>Create an account</Link></p>}
          <p className="auth-footnote"><Link href="/">Back to ScrapLess AI</Link></p>
        </form>
      </section>
    </main>
  );
}
