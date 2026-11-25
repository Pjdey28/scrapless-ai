"use client";

import { Activity, CircleDollarSign, Layers3, PackageCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { KpiCard } from "@/components/ui/kpi-card";
import { loadAnalytics } from "@/lib/analytics";
import type { AnalyticsOverview, AnalyticsTrend } from "@/types/api";

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [trends, setTrends] = useState<AnalyticsTrend[]>([]);
  const [material, setMaterial] = useState("all");
  const [orderFilter, setOrderFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics()
      .then(({ overview: overviewData, trends: rows }) => {
        setOverview(overviewData);
        setTrends(rows);
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => trends.filter((item) => {
    const date = item.date.slice(0, 10);
    return (material === "all" || item.material === material)
      && item.order_name.toLowerCase().includes(orderFilter.toLowerCase())
      && (!dateFrom || date >= dateFrom)
      && (!dateTo || date <= dateTo);
  }), [trends, material, orderFilter, dateFrom, dateTo]);
  const materials = [...new Set(trends.map((item) => item.material))];

  function exportCsv() {
    if (!filtered.length) return;
    const columns: (keyof AnalyticsTrend)[] = ["date", "run_id", "order_name", "algorithm", "material", "currency", "sheets_used", "utilization", "unused_area", "material_cost"];
    const content = [columns.join(","), ...filtered.map((row) => columns.map((key) => {
      const value = row[key];
      const safe = typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
      return JSON.stringify(safe);
    }).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "scrapless-analytics.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="page-header">
        <div><p className="eyebrow">MANUFACTURING ANALYTICS</p><h1>Measure material performance.</h1><p className="page-description">Charts and totals are derived from algorithm results actually returned and saved in the current data store.</p></div>
        <button className="btn btn-secondary" onClick={exportCsv} disabled={!filtered.length}>Export filtered CSV</button>
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {loading && <div className="kpi-grid" aria-busy="true" aria-label="Loading analytics">
        {Array.from({ length: 4 }, (_, index) => <div className="card skeleton-card" key={index}><span className="skeleton skeleton-label" /><span className="skeleton skeleton-value" /><span className="skeleton skeleton-caption" /></div>)}
      </div>}
      {overview && (
        <div className="kpi-grid">
          <KpiCard label="Analysis results" value={String(overview.run_count)} caption="Algorithms represented in history" icon={Activity} />
          <KpiCard label="Sheets consumed" value={String(overview.sheets_used)} caption="Across the current data store" icon={Layers3} />
          <KpiCard label="Requested instances" value={overview.requested_parts.toLocaleString()} caption="Counts each result's input" icon={PackageCheck} />
          <KpiCard label="Estimated material cost" value={overview.estimated_material_cost === null ? "Mixed currencies" : `${overview.cost_currency ?? ""} ${overview.estimated_material_cost.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} caption="Configured cost per stock sheet" icon={CircleDollarSign} />
        </div>
      )}
      <section className="card">
        <div className="card-heading">
          <div><h2>Filter analysis results</h2><p>{loading ? "Loading stored results…" : error ? "Stored results could not be loaded" : overview?.mode ?? "No analysis data yet"}</p></div>
          <div className="inline-actions">
            <select aria-label="Filter by material" className="select" value={material} onChange={(event) => setMaterial(event.target.value)}><option value="all">All materials</option>{materials.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            <input aria-label="Filter by order" className="input" placeholder="Find order…" value={orderFilter} onChange={(event) => setOrderFilter(event.target.value)} />
            <input aria-label="From date" className="input" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            <input aria-label="To date" className="input" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </div>
        </div>
      </section>
      <div className="dashboard-grid" style={{ marginTop: 14 }}>
        <section className="card">
          <div className="card-heading"><div><h2>Utilization across results</h2><p>Percent of stock area covered by physical part area</p></div></div>
          {filtered.length ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={filtered} margin={{ top: 12, right: 14, bottom: 8, left: 0 }}><CartesianGrid stroke="#e5e6dd" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 12, fill: "#687269" }} /><YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "#687269" }} /><Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "Utilization"]} /><Line type="monotone" dataKey="utilization" stroke="#586f1e" strokeWidth={3} dot={{ r: 4, fill: "#c8ed55", stroke: "#556d1d", strokeWidth: 2 }} activeDot={{ r: 6 }} /></LineChart></ResponsiveContainer></div> : <div className="empty compact"><h3>{loading ? "Loading utilization history" : error ? "Utilization history unavailable" : "Not enough history yet"}</h3><p>{error ? "Resolve the connection issue and reload the page to try again." : "Run a sample or production-order analysis. No historical points are invented."}</p></div>}
        </section>
        <section className="card">
          <div className="card-heading"><div><h2>Stock sheets by result</h2><p>Actual algorithm output</p></div></div>
          {filtered.length ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><BarChart data={filtered.slice(0, 12)} margin={{ top: 12, right: 12, bottom: 8, left: 0 }}><CartesianGrid stroke="#e5e6dd" vertical={false} /><XAxis dataKey="algorithm" tick={{ fontSize: 12, fill: "#687269" }} tickFormatter={(value) => value === "maxrects_bssf" ? "MaxRects" : "FFD"} /><YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#687269" }} /><Tooltip /><Bar dataKey="sheets_used" name="Sheets" fill="#9ab83d" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div> : <div className="empty compact"><h3>{error ? "Sheet usage unavailable" : "No results to compare"}</h3><p>{error ? "Resolve the connection issue and reload the page to try again." : "Run an optimization to see sheet usage."}</p></div>}
        </section>
      </div>
      <section className="card" style={{ marginTop: 14 }}>
        <div className="card-heading"><div><h2>Order-level results</h2><p>Estimated unused area is an area proxy; it does not classify reusable scrap.</p></div></div>
        {filtered.length ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={filtered.slice(0, 12)} margin={{ top: 12, right: 22, bottom: 8, left: 8 }}><CartesianGrid stroke="#e5e6dd" vertical={false} /><XAxis dataKey="order_name" tick={{ fontSize: 12, fill: "#687269" }} /><YAxis yAxisId="area" tick={{ fontSize: 12, fill: "#687269" }} /><YAxis yAxisId="cost" orientation="right" tick={{ fontSize: 12, fill: "#687269" }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 13, color: "#414a42" }} /><Bar yAxisId="area" dataKey="unused_area" name="Unused area proxy" fill="#d0a54b" radius={[4, 4, 0, 0]} /><Line yAxisId="cost" dataKey="material_cost" name="Estimated material cost" stroke="#596f2d" strokeWidth={3} /></ComposedChart></ResponsiveContainer></div> : <div className="empty compact"><h3>{error ? "Order analytics unavailable" : "Order analytics will appear here"}</h3><p>{error ? "Resolve the connection issue and reload the page to try again." : "There is not enough saved history to populate this chart."}</p></div>}
      </section>
    </>
  );
}
