"use client";

import { ArrowDownToLine, Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LayoutPreview } from "@/components/optimizer/layout-preview";
import { api, reportUrl } from "@/lib/api";
import { isDemoMode, supabase } from "@/lib/supabase";
import type { AlgorithmResult, HistoryEntry } from "@/types/api";

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState<AlgorithmResult | null>(null);
  const [search, setSearch] = useState("");
  const [algorithm, setAlgorithm] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (supabase) {
          const { data, error: queryError } = await supabase.from("optimization_runs")
            .select("created_at,payload,report_payload")
            .order("created_at", { ascending: false });
          if (queryError) throw queryError;
          if (active) setItems((data ?? []).map((row) => ({
            created_at: row.created_at,
            result: row.payload as AlgorithmResult,
            report_payload: row.report_payload as Record<string, unknown>,
          })));
        } else {
          if (active) setItems(await api.history());
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load optimization history.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => items.filter(({ created_at, result }) => {
    const matchesText = `${result.order_name} ${result.order_id} ${result.run_id}`.toLowerCase().includes(search.toLowerCase());
    const matchesAlgorithm = algorithm === "all" || result.algorithm === algorithm;
    const date = created_at.slice(0, 10);
    return matchesText && matchesAlgorithm && (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
  }), [items, search, algorithm, dateFrom, dateTo]);
  const comparisonRuns = compareIds.length === 2
    ? compareIds.map((id) => items.find((item) => item.result.run_id === id)?.result).filter((item): item is AlgorithmResult => Boolean(item))
    : [];
  const comparable = comparisonRuns.length === 2
    && comparisonRuns[0].order_id === comparisonRuns[1].order_id
    && JSON.stringify(comparisonRuns[0].sheet_config) === JSON.stringify(comparisonRuns[1].sheet_config)
    && comparisonRuns.every((item) => item.validation.valid);

  function downloadJson(entry: HistoryEntry) {
    if (isDemoMode) {
      window.location.assign(reportUrl(entry.result.run_id, "json"));
      return;
    }
    const payload = entry.report_payload ?? { analysis: entry.result };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `scrapless-${entry.result.run_id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadCsv(result: AlgorithmResult) {
    if (isDemoMode) {
      window.location.assign(reportUrl(result.run_id, "placements.csv"));
      return;
    }
    const columns = ["sheet_index", "part_id", "instance_id", "original_length", "original_width", "placed_length", "placed_width", "x", "y", "rotated", "status"] as const;
    const csv = [
      columns.join(","),
      ...result.placements.map((placement) => columns.map((key) => {
        const value = placement[key];
        const safe = typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
        return JSON.stringify(safe);
      }).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `scrapless-${result.run_id}-placements.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="page-header">
        <div><p className="eyebrow">ANALYSIS HISTORY</p><h1>Optimization runs</h1><p className="page-description">Review actual algorithm outputs, validation state, and exported layouts.</p></div>
        <span className="mode-badge"><span />{isDemoMode ? "SESSION ONLY" : "ACCOUNT HISTORY"}</span>
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <section className="card">
        <div className="card-heading">
          <div><h2>{items.length} saved algorithm result{items.length === 1 ? "" : "s"}</h2><p>{isDemoMode ? "In-memory backend history clears on restart; nothing is written to a database." : "This list is scoped by Supabase Row Level Security."}</p></div>
          <div className="inline-actions">
            <label style={{ position: "relative" }}><Search size={13} style={{ position: "absolute", left: 9, top: 11, color: "#89959a" }} /><input aria-label="Search history" className="input" style={{ width: 185, paddingLeft: 28 }} placeholder="Search runs…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <select className="select" aria-label="Filter by algorithm" style={{ width: 150 }} value={algorithm} onChange={(event) => setAlgorithm(event.target.value)}>
              <option value="all">All algorithms</option>
              <option value="first_fit_decreasing">First Fit Decreasing</option>
              <option value="maxrects_bssf">MaxRects BSSF</option>
            </select>
            <input aria-label="From date" className="input" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            <input aria-label="To date" className="input" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </div>
        </div>
        {compareIds.length === 2 && <div className={`notice ${comparable ? "notice-info" : "notice-error"}`} role={comparable ? "status" : "alert"} style={{ margin: "0 16px 12px" }}>
          {comparable
            ? <span>Compatible configurations · {comparisonRuns[0].algorithm} used {comparisonRuns[0].metrics.sheets_used} sheets ({comparisonRuns[0].metrics.utilization_percent.toFixed(1)}%); {comparisonRuns[1].algorithm} used {comparisonRuns[1].metrics.sheets_used} sheets ({comparisonRuns[1].metrics.utilization_percent.toFixed(1)}%).</span>
            : "Select two valid results for the same order and identical sheet configuration to compare."}
        </div>}
        {loading ? <div className="empty compact" role="status">Loading history…</div> : filtered.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Compare</th><th>Order</th><th>Algorithm</th><th>Created</th><th>Sheets</th><th>Utilization</th><th>Validation</th><th>Actions</th></tr></thead>
              <tbody>{filtered.map((entry) => {
                const { created_at, result } = entry;
                return <tr key={result.run_id}>
                  <td><input type="checkbox" aria-label={`Compare ${result.run_id}`} checked={compareIds.includes(result.run_id)} disabled={!compareIds.includes(result.run_id) && compareIds.length >= 2} onChange={(event) => setCompareIds((current) => event.target.checked ? [...current, result.run_id] : current.filter((id) => id !== result.run_id))} /></td>
                  <td><strong>{result.order_name}</strong><br /><span className="table-meta">{result.run_id.slice(0, 14)}…</span></td>
                  <td>{result.algorithm === "maxrects_bssf" ? "MaxRects BSSF" : "First Fit Decreasing"}</td>
                  <td>{new Date(created_at).toLocaleString()}</td>
                  <td>{result.metrics.sheets_used}</td>
                  <td>{result.validation.valid ? `${result.metrics.utilization_percent.toFixed(1)}%` : "Withheld"}</td>
                  <td><span className={`status-chip ${result.validation.valid ? "" : "invalid-chip"}`}>{result.validation.valid ? "Valid" : "Invalid"}</span></td>
                  <td><div className="inline-actions"><button className="btn btn-secondary" onClick={() => setSelected(result)}><ShieldCheck size={12} /> Inspect</button><button className="btn btn-secondary" onClick={() => downloadJson(entry)}><ArrowDownToLine size={12} /> JSON</button><button className="btn btn-secondary" onClick={() => downloadCsv(result)}><ArrowDownToLine size={12} /> CSV</button></div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        ) : <div className="empty compact"><h3>No matching runs</h3><p>Run a validated analysis to see its algorithm results here.</p></div>}
      </section>

      {selected && (
        <section className="card" style={{ marginTop: 15 }}>
          <div className="card-heading"><div><h2>{selected.order_name}</h2><p>{selected.algorithm} · {selected.run_id}</p></div><button className="btn btn-secondary" onClick={() => setSelected(null)}>Close</button></div>
          {selected.validation.valid ? <LayoutPreview result={selected} /> : <div className="notice notice-error">Validation failed: {selected.validation.errors.join(" ")}</div>}
        </section>
      )}
    </>
  );
}
