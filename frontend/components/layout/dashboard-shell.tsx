"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity, Boxes, BrainCircuit, ChartNoAxesCombined, ChevronRight, CircleHelp,
  ClipboardList, Factory, LayoutDashboard, LogOut, Menu, Settings2, Scissors, X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { isDemoMode, supabase } from "@/lib/supabase";

const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/orders", label: "Production orders", icon: ClipboardList },
  { href: "/dashboard/optimize", label: "Cutting optimizer", icon: Scissors },
  { href: "/dashboard/analytics", label: "Analytics", icon: ChartNoAxesCombined },
  { href: "/dashboard/ai-insights", label: "Scrap-risk insights", icon: BrainCircuit },
  { href: "/dashboard/vision", label: "Image detection", icon: Boxes },
  { href: "/dashboard/history", label: "Run history", icon: Activity },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const pageTitle = pathname === "/dashboard/settings"
    ? "Settings"
    : links.find((item) => item.href === pathname)?.label ?? "ScrapLess AI";
  const [ready, setReady] = useState(isDemoMode);
  const [authorized, setAuthorized] = useState(isDemoMode);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setAuthorized(Boolean(data.user) && !error);
      setReady(true);
      if (!data.user || error) router.replace("/login");
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthorized(Boolean(session?.user));
      if (!session?.user) router.replace("/login");
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  async function logout() {
    if (supabase) await supabase.auth.signOut();
    router.replace("/");
  }

  if (!ready || !authorized) {
    return <div className="loading-screen" role="status">Checking your ScrapLess workspace…</div>;
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      {mobileOpen && <button className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`} id="workspace-navigation">
        <div className="brand-lockup">
          <div className="brand-mark"><Factory size={21} /></div>
          <div><strong>scrapless<span>ai</span></strong><small>Manufacturing intelligence</small></div>
          <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <div className="nav-section-label">OPERATIONS</div>
        <nav className="side-nav" aria-label="Main navigation">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
            return (
              <Link
                className={`nav-link ${active ? "nav-link-active" : ""}`}
                href={href}
                key={href}
                aria-current={active ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
                {active && <ChevronRight className="nav-chevron" size={15} />}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help"><CircleHelp size={17} /><span>Need help?</span><a href="mailto:support@scrapless.ai">Contact us</a></div>
          <Link className={`nav-link ${pathname === "/dashboard/settings" ? "nav-link-active" : ""}`} href="/dashboard/settings" aria-current={pathname === "/dashboard/settings" ? "page" : undefined}>
            <Settings2 size={17} /><span>Settings</span>
          </Link>
          <button className="nav-link signout-link" onClick={logout}><LogOut size={17} /><span>{supabase ? "Sign out" : "Back to site"}</span></button>
          <div className="sidebar-profile">
            <div className="profile-avatar">SL</div><div><strong>{isDemoMode ? "Demo workspace" : "Your workspace"}</strong><small>{isDemoMode ? "Local demo mode" : "Authenticated account"}</small></div>
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation" aria-controls="workspace-navigation" aria-expanded={mobileOpen}><Menu size={21} /></button>
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{pageTitle}</strong></div>
          <div className="topbar-right">
            <span className={`mode-badge ${isDemoMode ? "mode-demo" : "mode-live"}`}><span />{isDemoMode ? "DEMO MODE" : "CONNECTED"}</span>
            <div className="profile-avatar top-avatar">SL</div>
          </div>
        </header>
        <main className="main-content" id="main-content" tabIndex={-1}>{children}</main>
        <footer className="app-footer"><span>ScrapLess AI · Predict waste. Optimize cutting.</span><span>{isDemoMode ? "Demo data is not persisted." : "Your account data is protected by Supabase RLS."}</span></footer>
      </div>
    </div>
  );
}
