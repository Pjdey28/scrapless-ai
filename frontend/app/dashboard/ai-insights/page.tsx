"use client";

import { AlertTriangle, BrainCircuit, CircleHelp } from "lucide-react";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { ModelEvaluation, Order, Part, RiskPrediction } from "@/types/api";

const sampleSheet = {
  length: 2440, width: 1220, material: "MDF", cost_per_sheet: 45, currency: "USD",
  spacing: 3, allow_rotation: true, max_sheets: 50, margin: 0,
};

export default function AiInsightsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [risk, setRisk] = useState<RiskPrediction | null>(null);
  const [evaluation, setEvaluation] = useState<ModelEvaluation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.sampleOrder(),
      api.modelEvaluation(),
      supabase
        ? supabase.from("production_orders").select("order_id,name,parts").then(({ data, error: loadError }) => {
          if (loadError) throw loadError;
          return (data ?? []).map((row) => ({ order_id: row.order_id, name: row.name, parts: row.parts as Part[] }));
        })
        : Promise.resolve([] as Order[]),
    ]).then(async ([sample, model, saved]) => {
      if (!active) return;
      const allOrders = [sample, ...saved.filter((item) => item.order_id !== sample.order_id)];
      setOrders(allOrders);
      setSelectedId(sample.order_id);
      setEvaluation(model);
      const prediction = await api.risk(sample, sampleSheet);
      if (active)       setRisk(prediction);
    }).catch((cause: Error) => {
      if (active) setError(cause.message);
    });
    return () => { active = false; };
  }, []);

  async function changeOrder(orderId: string) {
    setSelectedId(orderId);
    const order = orders.find((item) => item.order_id === orderId);
    if (!order) return;
    setBusy(true);
    setError("");
    try {
      setRisk(await api.risk(order, sampleSheet));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Risk assessment failed.");
    } finally {
      setBusy(false);
    }
  }

  const importance = risk?.feature_importance ?? [];
  const featureLabel = (name: string) => name.replaceAll("_", " ");

  return (
    <>
      <div className="page-header">
        <div><p className="eyebrow">EXPERIMENTAL MACHINE LEARNING</p><h1>Review scrap-risk signals.</h1><p className="page-description">A synthetic-data classifier can help prioritize review. It does not replace the deterministic packing results.</p></div>
        <span className="mode-badge"><span /> SYNTHETIC MODEL</span>
      </div>
      <div className="notice"><AlertTriangle size={15} /> Model scores are not calibrated real-world probabilities and are not industry-validated.</div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
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
            {!risk || busy ? <div className="empty compact" role="status">Evaluating this order…</div> : (
              <>
                <div className={`notice ${risk.risk_class === "high" ? "notice-error" : "notice-success"}`} style={{ marginTop: 14 }}>
                  <span><strong>{risk.risk_class === "high" ? "Higher synthetic risk signal" : "Lower synthetic risk signal"}</strong><br />Model score: {(risk.model_score * 100).toFixed(1)}% · not a real-world probability.</span>
                </div>
                <p style={{ color: "#63737a", fontSize: 10, lineHeight: 1.65 }}>{risk.explanation}</p>
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
          {importance.length ? <div className="chart-area" style={{ height: 330 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={importance} layout="vertical" margin={{ left: 10, right: 18, top: 5, bottom: 5 }}><CartesianGrid stroke="#edf1ef" horizontal={false} /><XAxis type="number" tick={{ fontSize: 8 }} /><YAxis type="category" dataKey="feature" width={135} tick={{ fontSize: 8 }} tickFormatter={featureLabel} /><Tooltip formatter={(value) => [Number(value).toFixed(3), "Importance"]} /><Bar dataKey="importance" fill="#438564" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer></div> : <div className="empty compact">Model importance will appear after evaluation.</div>}
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
