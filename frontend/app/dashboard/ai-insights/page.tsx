"use client";

import { AlertTriangle, BrainCircuit, CircleHelp } from "lucide-react";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { loadOrders } from "@/lib/persistence";
import type { ModelEvaluation, Order, RiskPrediction, SavedOrder, SheetConfig } from "@/types/api";

const sampleSheet: SheetConfig = {
  length: 2440, width: 1220, material: "MDF", cost_per_sheet: 45, currency: "USD",
  spacing: 3, allow_rotation: true, max_sheets: 50, margin: 0,
};

export default function AiInsightsPage() {
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [risk, setRisk] = useState<RiskPrediction | null>(null);
  const [evaluation, setEvaluation] = useState<ModelEvaluation | null>(null);
  const [error, setError] = useState("");
  const [evaluationError, setEvaluationError] = useState("");
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setInitialLoading(true);
    setError("");
    setEvaluationError("");
    setRisk(null);
    void (async () => {
      const [sampleResult, modelResult, savedResult] = await Promise.allSettled([
        api.sampleOrder(),
        api.modelEvaluation(),
        loadOrders(),
      ]);
      if (!active) return;

      const sample = sampleResult.status === "fulfilled" ? sampleResult.value : null;
      const saved = savedResult.status === "fulfilled" ? savedResult.value : [];
      const allOrders = [
        ...(sample ? [{ ...sample, metadata: { sheet_config: sampleSheet } }] : []),
        ...saved.filter((item) => item.order_id !== sample?.order_id),
      ];
      setOrders(allOrders);
      setSelectedId(allOrders[0]?.order_id ?? "");
      if (modelResult.status === "fulfilled") {
        setEvaluation(modelResult.value);
      } else {
        setEvaluation(null);
        setEvaluationError(modelResult.reason instanceof Error
          ? modelResult.reason.message
          : "Model evaluation could not be loaded.");
      }

      const setupErrors = [
        ...(sampleResult.status === "rejected"
          ? [sampleResult.reason instanceof Error ? sampleResult.reason.message : "The sample order could not be loaded."]
          : []),
        ...(savedResult.status === "rejected"
          ? [savedResult.reason instanceof Error ? savedResult.reason.message : "Saved orders could not be loaded."]
          : []),
      ];
      if (setupErrors.length) setError(setupErrors.join(" "));

      const selectedOrder = allOrders[0];
      if (selectedOrder) {
        try {
          const order: Order = { order_id: selectedOrder.order_id, name: selectedOrder.name, parts: selectedOrder.parts };
          setRisk(await api.risk(order, selectedOrder.metadata?.sheet_config ?? sampleSheet));
        } catch (cause) {
          if (active) setError(cause instanceof Error ? cause.message : "Risk assessment failed.");
        }
      }
      if (active) setInitialLoading(false);
    })();
    return () => { active = false; };
  }, [retryKey]);

  async function changeOrder(orderId: string) {
    setSelectedId(orderId);
    const order = orders.find((item) => item.order_id === orderId);
    if (!order) return;
    setBusy(true);
    setRisk(null);
    setError("");
    try {
      const requestOrder: Order = { order_id: order.order_id, name: order.name, parts: order.parts };
      setRisk(await api.risk(requestOrder, order.metadata?.sheet_config ?? sampleSheet));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Risk assessment failed.");
    } finally {
      setBusy(false);
    }
  }

  const importance = risk?.feature_importance ?? [];
  const featureLabel = (name: string) => name.replaceAll("_", " ");
  const selectedOrder = orders.find((order) => order.order_id === selectedId);
  const selectedSheet = selectedOrder?.metadata?.sheet_config ?? sampleSheet;
  const oversizedParts = selectedOrder?.parts.filter((part) => {
    const fitsWithoutRotation = part.length <= selectedSheet.length && part.width <= selectedSheet.width;
    const fitsRotated = part.width <= selectedSheet.length && part.length <= selectedSheet.width;
    return !fitsWithoutRotation && !(selectedSheet.allow_rotation && fitsRotated);
  }) ?? [];
  const demandInSheetAreas = selectedOrder
    ? selectedOrder.parts.reduce((sum, part) => sum + part.length * part.width * part.quantity, 0)
      / (selectedSheet.length * selectedSheet.width)
    : 0;

  return (
    <>
      <div className="page-header">
        <div><p className="eyebrow">EXPERIMENTAL MACHINE LEARNING</p><h1>Review scrap-risk signals.</h1><p className="page-description">A synthetic-data classifier can help prioritize review. It does not replace the deterministic packing results.</p></div>
        <span className="mode-badge"><span /> SYNTHETIC MODEL</span>
      </div>
      <div className="notice"><AlertTriangle size={15} /> Model scores are not calibrated real-world probabilities and are not industry-validated.</div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {selectedOrder && <section className="card" style={{ marginBottom: 14 }}>
        <div className="card-heading"><div><h2>Order and stock checks</h2><p>Deterministic checks calculated from the selected order, not ML recommendations.</p></div></div>
        <div style={{ padding: "0 16px 16px" }}>
          {oversizedParts.length
            ? <div className="notice notice-error" role="alert">These parts cannot fit the selected sheet with the current rotation rule: {oversizedParts.map((part) => part.part_id).join(", ")}.</div>
            : <div className="notice notice-success">Every requested part dimension fits at least one allowed orientation on the {selectedSheet.material} sheet.</div>}
          <p className="hero-meta">Aggregate part area is {demandInSheetAreas.toFixed(2)} single-sheet areas before kerf, margins, and geometric packing. This is a workload indicator, not predicted utilization or a substitute for the validated layouts.</p>
        </div>
      </section>}
      <div className="dashboard-grid">
        <section className="card">
          <div className="card-heading"><div><h2>Order risk assessment</h2><p>Feature-based synthetic model result</p></div><BrainCircuit size={17} color="#28714e" /></div>
          <div style={{ padding: "0 16px 16px" }}>
            <div className="field">
              <label htmlFor="risk-order">Order</label>
              <select id="risk-order" className="select" value={selectedId} onChange={(event) => void changeOrder(event.target.value)} disabled={!orders.length || busy}>
                {orders.map((order) => <option value={order.order_id} key={order.order_id}>{order.name}</option>)}
              </select>
            </div>
            {initialLoading || busy ? <div className="empty compact" role="status" aria-busy="true">Evaluating this order…</div> : !orders.length ? <div className="empty compact" role="status"><h3>No order is available</h3><p>Check the API connection and saved-order access, then try again.</p><button className="btn btn-secondary" type="button" onClick={() => setRetryKey((current) => current + 1)}>Retry loading insights</button></div> : !risk ? <div className="empty compact" role="status"><h3>Assessment unavailable</h3><p>{error || "No risk result is available for this order."}</p><button className="btn btn-secondary" type="button" onClick={() => setRetryKey((current) => current + 1)}>Retry assessment</button></div> : (
              <>
                <div className={`notice ${risk.risk_class === "high" ? "notice-error" : "notice-success"}`} style={{ marginTop: 14 }}>
                  <span><strong>{risk.risk_class === "high" ? "Higher synthetic risk signal" : "Lower synthetic risk signal"}</strong><br />Synthetic-model confidence score: {(risk.model_score * 100).toFixed(1)}% · not calibrated and not a real-world probability.</span>
                </div>
                <p style={{ color: "#687269", fontSize: 15, lineHeight: 1.65 }}>{risk.explanation}</p>
                <div className="section-label">Input features</div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Feature</th><th>Observed value</th></tr></thead>
                    <tbody>{Object.entries(risk.features).map(([name, value]) => <tr key={name}><td>{featureLabel(name)}</td><td>{Number(value).toFixed(4)}</td></tr>)}</tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>
        <section className="card">
          <div className="card-heading"><div><h2>Feature importance</h2><p>Global model importance, not a causal explanation</p></div><CircleHelp size={16} color="#869398" /></div>
          {evaluationError && <div className="notice notice-error" role="alert" style={{ margin: "0 15px 12px" }}>{evaluationError} <button className="btn btn-secondary" type="button" onClick={() => setRetryKey((current) => current + 1)}>Retry evaluation</button></div>}
          {importance.length ? <div className="chart-area" style={{ height: 360 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={importance} layout="vertical" margin={{ left: 12, right: 22, top: 8, bottom: 8 }}><CartesianGrid stroke="#e5e6dd" horizontal={false} /><XAxis type="number" tick={{ fontSize: 12, fill: "#687269" }} /><YAxis type="category" dataKey="feature" width={145} tick={{ fontSize: 13, fill: "#414a42" }} tickFormatter={featureLabel} /><Tooltip formatter={(value) => [Number(value).toFixed(3), "Importance"]} /><Bar dataKey="importance" fill="#9ab83d" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></div> : <div className="empty compact">Model importance will appear after evaluation.</div>}
          <div style={{ padding: "0 15px 15px" }}>
            {evaluation && <div className="metric-strip">
              {(["accuracy", "precision", "recall", "f1"] as const).map((key) => <div className="metric-mini" key={key}><span>Synthetic {key}</span><strong>{(evaluation[key] * 100).toFixed(1)}%</strong></div>)}
            </div>}
          </div>
        </section>
      </div>
      <section className="card" style={{ marginTop: 14 }}>
        <div className="card-heading"><div><h2>Model scope and limitations</h2><p>Model version: {risk?.model_version ?? "loading"} · fixed-seed synthetic training data</p></div></div>
        <div style={{ padding: "0 16px 16px" }}>
          <div className="notice notice-info">{risk?.data_disclaimer ?? "Risk assessment uses a synthetic training dataset and is not an industry-validated predictor."}</div>
          <p className="page-description">Review the order dimensions, area fit, aspect ratios, and the actual FFD/MaxRects output. Neither this score nor its feature ranking establishes a causal reason for scrap or overrides geometric validation.</p>
          {evaluation && Array.isArray(evaluation.confusion_matrix) && <p className="hero-meta">Test partition confusion matrix: {JSON.stringify(evaluation.confusion_matrix)} · Training/test rows: {String(evaluation.training_rows)}/{String(evaluation.testing_rows)}</p>}
        </div>
      </section>
    </>
  );
}
