"use client";

import { AlertTriangle, Database, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { deleteDemoOrders, insertDemoOrders, loadOrders } from "@/lib/persistence";
import { isDemoMode } from "@/lib/supabase";
import type { DemoDataset, DemoOptimizationOutcome } from "@/types/api";

const BATCH_SIZE = 5;

interface WorkspaceReport {
  ordersCreated: number;
  ordersSkipped: number;
  runsCreated: number;
  ordersOptimized: number;
  failures: { order_id: string; detail: string }[];
}

function announceWorkspaceChange() {
  window.dispatchEvent(new Event("scrapless:orders-updated"));
}

function isCompletePair(history: Awaited<ReturnType<typeof api.history>>, orderId: string, datasetId: string) {
  const results = history.filter((entry) => entry.result.order_id === orderId
    && entry.demo_dataset_id === datasetId
    && entry.result.validation.valid);
  return results.some((entry) => entry.result.algorithm === "first_fit_decreasing")
    && results.some((entry) => entry.result.algorithm === "maxrects_bssf");
}

export function DemoWorkspaceManager() {
  const [dialog, setDialog] = useState<"load" | "reset" | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [report, setReport] = useState<WorkspaceReport | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadWorkspace() {
    setDialog(null);
    setBusy(true);
    setError("");
    setNotice("");
    setReport(null);
    try {
      setProgress("Loading the deterministic Apex dataset…");
      const dataset: DemoDataset = await api.demoDataset();
      const existing = await loadOrders();
      setProgress(`Saving ${dataset.records.length} production orders…`);
      const insertResult = await insertDemoOrders(dataset.records, existing);
      const failures = [...insertResult.failures];
      const failedIds = new Set(failures.map((item) => item.order_id));
      const eligible = dataset.records.filter((record) => {
        const existingOrder = existing.find((item) => item.order_id === record.order.order_id);
        const alreadyDemo = existingOrder?.demo_dataset_id === dataset.dataset_id;
        const inserted = !existingOrder && !failedIds.has(record.order.order_id);
        return alreadyDemo || inserted;
      });

      setProgress("Checking saved FFD and MaxRects results…");
      const history = await api.history();
      const pending = eligible.filter((record) =>
        !isCompletePair(history, record.order.order_id, dataset.dataset_id),
      );
      let runsCreated = 0;
      let ordersOptimized = eligible.length - pending.length;

      for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
        const batch = pending.slice(offset, offset + BATCH_SIZE);
        setProgress(`Running and validating both algorithms for ${Math.min(offset + batch.length, pending.length)} of ${pending.length} remaining orders…`);
        let response: Awaited<ReturnType<typeof api.optimizeDemoBatch>>;
        try {
          response = await api.optimizeDemoBatch(
            dataset.dataset_id,
            batch.map((record) => record.order.order_id),
          );
        } catch (cause) {
          const detail = cause instanceof Error ? cause.message : "The optimization batch failed.";
          failures.push(...batch.map((record) => ({ order_id: record.order.order_id, detail })));
          continue;
        }
        const outcomeById = new Map<string, DemoOptimizationOutcome>(
          response.outcomes.map((outcome) => [outcome.order_id, outcome]),
        );
        for (const record of batch) {
          const outcome = outcomeById.get(record.order.order_id);
          if (!outcome) {
            failures.push({ order_id: record.order.order_id, detail: "The API omitted this order from its batch response." });
          } else {
            runsCreated += outcome.run_ids.length;
            if (outcome.success && outcome.run_ids.length === 2) {
              ordersOptimized += 1;
            } else {
              failures.push({
                order_id: record.order.order_id,
                detail: outcome.detail ?? "Both layouts did not pass validation.",
              });
            }
          }
        }
      }

      setReport({
        ordersCreated: insertResult.created,
        ordersSkipped: insertResult.skipped,
        runsCreated,
        ordersOptimized,
        failures,
      });
      setProgress("");
      announceWorkspaceChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The demo workspace could not be loaded.");
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  async function resetWorkspace() {
    setDialog(null);
    setBusy(true);
    setError("");
    setNotice("");
    setReport(null);
    try {
      setProgress("Removing only records marked with the Apex demo dataset ID…");
      const dataset: DemoDataset = await api.demoDataset();
      const runResult = await api.resetDemoWorkspace(dataset.dataset_id);
      const ordersDeleted = await deleteDemoOrders(dataset.dataset_id);
      setProgress("");
      setNotice(`Demo data reset complete: ${ordersDeleted} demo orders and ${runResult.optimization_records_deleted} demo algorithm results removed. Non-demo records were not targeted.`);
      announceWorkspaceChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The demo workspace could not be reset.");
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="inline-actions">
        <button className="btn btn-primary" type="button" onClick={() => { setError(""); setDialog("load"); }} disabled={busy}>
          <Sparkles size={15} /> Load Demo Workspace
        </button>
        <button className="btn btn-secondary" type="button" onClick={() => { setError(""); setDialog("reset"); }} disabled={busy}>
          <RotateCcw size={14} /> Reset demo data
        </button>
      </div>
      {busy && <div className="notice notice-info" role="status" aria-busy="true"><LoaderCircle className="spin" size={15} /> {progress}</div>}
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {notice && <div className="notice notice-success" role="status">{notice}</div>}
      {report && (
        <section className={`notice ${report.failures.length ? "notice-error" : "notice-success"}`} role={report.failures.length ? "alert" : "status"}>
          <Database size={16} />
          <div>
            <strong>{report.failures.length
              ? "Demo workspace completed with failures"
              : report.ordersCreated === 0 && report.ordersSkipped > 0 && report.runsCreated === 0
                ? "Demo workspace already populated"
                : "Demo workspace is ready"}</strong>
            <p>{report.ordersCreated} orders created · {report.ordersSkipped} existing orders retained · {report.ordersOptimized} orders have a validated FFD/MaxRects pair · {report.runsCreated} algorithm results generated in this operation.</p>
            {report.failures.length > 0 && <ul>{report.failures.map((failure) => <li key={`${failure.order_id}-${failure.detail}`}><strong>{failure.order_id}:</strong> {failure.detail}</li>)}</ul>}
          </div>
        </section>
      )}
      {dialog && (
        <div className="demo-dialog-backdrop">
          <section className="card demo-dialog" role="dialog" aria-modal="true" aria-labelledby="demo-dialog-title">
            <h2 id="demo-dialog-title">{dialog === "load" ? "Load the Demo Workspace?" : "Reset Demo Workspace data?"}</h2>
            {dialog === "load" ? (
              <>
                <p>This loads 25 fictional Apex Industrial Components orders. FFD and MaxRects will run through the FastAPI optimization service, and only validated layouts count as completed.</p>
                <div className="notice"><AlertTriangle size={15} /> Orders and history with the same stable dataset identifier are reused. Existing non-demo orders are never overwritten.</div>
                <p className="table-meta">{isDemoMode ? "Development mode: orders persist in this browser; optimization results persist only in backend memory." : "Authenticated mode: orders and runs are saved to your signed-in Supabase account using owner-scoped access."}</p>
              </>
            ) : (
              <>
                <p>This removes only orders and algorithm results marked with the Apex Industrial Components demo dataset identifier.</p>
                <div className="notice notice-error"><AlertTriangle size={15} /> Your own orders and non-demo optimization history will not be targeted.</div>
              </>
            )}
            <div className="inline-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setDialog(null)}>Cancel</button>
              <button className={dialog === "load" ? "btn btn-primary" : "btn btn-danger"} type="button" onClick={() => void (dialog === "load" ? loadWorkspace() : resetWorkspace())}>
                {dialog === "load" ? "Confirm and load" : "Reset demo data"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
