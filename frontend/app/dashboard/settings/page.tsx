"use client";

import { CheckCircle2, CircleAlert, ExternalLink, Settings2 } from "lucide-react";
import Link from "next/link";
import { isDemoMode } from "@/lib/supabase";
import { DemoWorkspaceManager } from "@/components/demo/demo-workspace-manager";

export default function SettingsPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  return (
    <>
      <div className="page-header"><div><p className="eyebrow">WORKSPACE CONFIGURATION</p><h1>Settings</h1><p className="page-description">Review the active integration mode and configuration needed for a hosted workspace.</p></div><Settings2 size={20} color="#28714e" /></div>
      <section className="card">
        <div className="card-heading"><div><h2>Connected services</h2><p>Secrets are never read from browser-visible configuration.</p></div></div>
        <div style={{ padding: "0 17px 17px" }}>
          <div className="settings-list">
            <div className="settings-row"><div><strong>Application mode</strong><span>{isDemoMode ? "Orders persist in this browser; demo optimization history is held in backend memory and clears on backend restart." : "Authenticated workspace. Saved records are protected with Row Level Security."}</span></div>{isDemoMode ? <CircleAlert size={16} color="#ad7c24" /> : <CheckCircle2 size={16} color="#27815a" />}</div>
            <div className="settings-row"><div><strong>FastAPI service</strong><span>{apiUrl}</span></div><a href={`${apiUrl}/docs`} target="_blank" rel="noreferrer" aria-label="Open API documentation"><ExternalLink size={15} /></a></div>
            <div className="settings-row"><div><strong>Supabase Auth and PostgreSQL</strong><span>{isDemoMode ? "Not configured. Set the public URL and anon key to enable sign-in and RLS-backed history." : "Configured in this browser session."}</span></div>{isDemoMode ? <CircleAlert size={16} color="#ad7c24" /> : <CheckCircle2 size={16} color="#27815a" />}</div>
            <div className="settings-row"><div><strong>Optimization engine</strong><span>First Fit Decreasing baseline and MaxRects Best Short Side Fit run on the Python backend.</span></div><CheckCircle2 size={16} color="#27815a" /></div>
          </div>
          {isDemoMode && <div className="notice" style={{ marginTop: 14 }}>Demo mode uses local browser storage for orders and bounded backend memory for computed optimization results. Results are not durable across backend restarts.</div>}
          <Link className="btn btn-secondary" href="/dashboard/optimize">Open optimizer</Link>
        </div>
      </section>
      <section className="card" style={{ marginTop: 15 }}>
        <div className="card-heading"><div><h2>Apex Industrial Components</h2><p>Deterministic fictional order data; computed layouts use the production FFD and MaxRects API.</p></div></div>
        <div style={{ padding: "0 17px 17px" }}><DemoWorkspaceManager /></div>
      </section>
    </>
  );
}
