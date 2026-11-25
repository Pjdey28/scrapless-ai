"use client";

import Link from "next/link";
import { Activity, ArrowRight, Boxes, CircleDollarSign, Layers3, PackageCheck, Scissors } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { loadAnalytics } from "@/lib/analytics";
import { api } from "@/lib/api";
import { loadOrders } from "@/lib/persistence";
import { DemoWorkspaceManager } from "@/components/demo/demo-workspace-manager";
import { isDemoMode } from "@/lib/supabase";
import { KpiCard } from "@/components/ui/kpi-card";
import type { AnalyticsOverview, AnalyticsTrend, HistoryEntry, SavedOrder } from "@/types/api";

export default function DashboardPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [trends, setTrends] = useState<AnalyticsTrend[]>([]);
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [{ overview: summary, trends: rows }, savedOrders, runHistory] = await Promise.all([
        loadAnalytics(),
        loadOrders(),
        api.history(),
      ]);
      setOverview(summary);
      setTrends(rows);
      setOrders(savedOrders);
      setHistory(runHistory);
    } catch (cause) {
      setOverview(null);
      setTrends([]);
      setOrders([]);
      setHistory([]);
      setError(cause instanceof Error ? cause.message : "The workspace overview could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const onWorkspaceUpdate = () => { void refresh(); };
    window.addEventListener("scrapless:orders-updated", onWorkspaceUpdate);
    return () => window.removeEventListener("scrapless:orders-updated", onWorkspaceUpdate);
  }, [refresh]);

  const completedOrderIds = new Set(
    orders.filter((order) => {
      const results = history.filter((entry) => entry.result.order_id === order.order_id
        && entry.result.validation.valid);
      return results.some((entry) => entry.result.algorithm === "first_fit_decreasing")
        && results.some((entry) => entry.result.algorithm === "maxrects_bssf");
    }).map((order) => order.order_id),
  );

  return (
    <>
      <div className="page-header">
        <div><p className="eyebrow">OPERATIONS OVERVIEW</p><h1>Good planning starts here.</h1><p className="page-description">A clear view of your saved optimization work and material performance.</p></div>
        <div className="dashboard-header-actions"><DemoWorkspaceManager /><Link href="/dashboard/optimize" className="btn btn-secondary"><Scissors size={14} /> New optimization</Link></div>
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {loading ? (
        <div className="kpi-grid" aria-busy="true" aria-label="Loading workspace overview">
          {Array.from({ length: 6 }, (_, index) => <div className="card skeleton-card" key={index}><span className="skeleton skeleton-label" /><span className="skeleton skeleton-value" /><span className="skeleton skeleton-caption" /></div>)}
        </div>
      ) : !overview ? (
        <div className="card empty compact" role="alert"><h3>Overview is unavailable</h3><p>{error || "No analysis data could be loaded. Check the service connection and try again."}</p><button className="btn btn-secondary" type="button" onClick={() => void refresh()}>Retry loading overview</button></div>
      ) : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Production orders" value={String(orders.length)} caption="Saved in the current workspace" icon={PackageCheck} />
            <KpiCard label="Awaiting optimization" value={String(orders.length - completedOrderIds.size)} caption="Needs a valid FFD + MaxRects pair" icon={Activity} />
            <KpiCard label="Completed order runs" value={String(completedOrderIds.size)} caption="Both layouts independently validated" icon={Layers3} />
            <KpiCard label="Optimization results" value={String(overview.run_count)} caption="Actual algorithm results in history" icon={Activity} />
            <KpiCard label="Stock sheets used" value={String(overview.sheets_used)} caption="Across returned algorithm results" icon={Layers3} />
            <KpiCard label="Requested instances" value={overview.requested_parts.toLocaleString()} caption="Counts each result input" icon={PackageCheck} />
            <KpiCard label="Average utilization" value={`${overview.average_utilization_percent?.toFixed(1) ?? "—"}%`} caption="Physical area ÷ stock-sheet area" icon={Activity} />
            <KpiCard label="Estimated unused area" value={overview.estimated_unused_area.toLocaleString(undefined, { maximumFractionDigits: 0 })} caption="Area proxy, not offcut reuse value" icon={Boxes} />
            <KpiCard label="Estimated material cost" value={overview.estimated_material_cost === null ? "Mixed currencies" : `${overview.cost_currency ?? ""} ${overview.estimated_material_cost.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} caption="Configured sheet cost estimate" icon={CircleDollarSign} />
          </div>
          <section className="card" style={{ marginTop: 14 }}>
            <div className="card-heading"><div><h2>Recent optimization activity</h2><p>Actual results in the current data store.</p></div><Link className="btn btn-quiet" href="/dashboard/history">View history <ArrowRight size={13} /></Link></div>
            {trends.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Order</th><th>Algorithm</th><th>Material</th><th>Date</th><th>Sheets</th><th>Utilization</th></tr></thead><tbody>{trends.slice(-5).reverse().map((item) => <tr key={item.run_id}><td><strong>{item.order_name}</strong></td><td>{item.algorithm === "maxrects_bssf" ? "MaxRects BSSF" : "First Fit Decreasing"}</td><td>{item.material}</td><td>{item.date}</td><td>{item.sheets_used}</td><td>{item.utilization.toFixed(1)}%</td></tr>)}</tbody></table></div> : <div className="empty compact"><h3>No recent activity</h3><p>Run a sample analysis to populate the workspace.</p></div>}
          </section>
          <div className="dashboard-grid">
            <section className="card">
              <div className="card-heading"><div><h2>Material utilization</h2><p>{overview.mode}</p>{trends.some((item) => item.timestamp_is_simulated) && <p className="table-meta">Demo order dates are simulated historical dates; placements and metrics are computed by the live algorithms.</p>}</div><span className="status-chip">Actual runs</span></div>
              {overview.run_count > 0 && trends.length ? (
                <div className="chart-area">
                  <ResponsiveContainer width="100%" height="100%"><LineChart data={trends.slice(-20)} margin={{ top: 12, right: 14, bottom: 8, left: 0 }}><XAxis dataKey="date" tick={{ fontSize: 12, fill: "#687269" }} /><YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "#687269" }} /><Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "Utilization"]} /><Line type="monotone" dataKey="utilization" stroke="#586f1e" strokeWidth={3} dot={{ r: 4, fill: "#c8ed55", stroke: "#556d1d", strokeWidth: 2 }} activeDot={{ r: 6 }} /></LineChart></ResponsiveContainer>
                  <p className="hero-meta" style={{ textAlign: "center" }}>Utilization is physical placed-part area ÷ stock-sheet area.</p>
                </div>
              ) : (
                <div className="empty compact">
                  <div className="empty-icon"><Boxes size={20} /></div>
                  <h3>No optimization data yet</h3>
                  <p>Run both algorithms on a sample or production order to populate these metrics. {isDemoMode ? "Development demo results are held in memory only." : "Authenticated results are saved to your account."}</p>
                  <Link className="btn btn-secondary" href="/dashboard/optimize">Run sample analysis <ArrowRight size={13} /></Link>
                </div>
              )}
            </section>
            <section className="card">
              <div className="card-heading"><div><h2>Planning notes</h2><p>What the metrics do and do not say</p></div></div>
              <div style={{ padding: "8px 17px 17px" }}>
                <div className="notice notice-info"><Layers3 size={15} /> Unused area is a stock-area proxy; it does not determine whether offcuts are reusable.</div>
                <div className="notice notice-info"><Scissors size={15} /> MaxRects is a heuristic and does not guarantee a globally optimal or guillotine-cuttable layout.</div>
                <div className="notice"><Activity size={15} /> Current mode: <strong>{overview.mode}</strong></div>
                <Link className="btn btn-quiet" href="/dashboard/history">View run history <ArrowRight size={13} /></Link>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
