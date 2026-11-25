"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, ArrowDownToLine, FileUp, LoaderCircle, Play, Scissors, Sheet, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { LayoutPreview } from "@/components/optimizer/layout-preview";
import { api } from "@/lib/api";
import { isDemoMode, supabase } from "@/lib/supabase";
import type { AlgorithmResult, CsvValidation, OptimizationResponse, Order, Part, SheetConfig } from "@/types/api";

const sheetSchema = z.object({
  length: z.coerce.number().finite().positive("Enter a positive sheet length.").max(100_000, "Sheet length cannot exceed 100,000."),
  width: z.coerce.number().finite().positive("Enter a positive sheet width.").max(100_000, "Sheet width cannot exceed 100,000."),
  material: z.string().trim().min(1, "Select a material."),
  cost_per_sheet: z.coerce.number().finite().min(0, "Cost cannot be negative.").max(1_000_000_000, "Cost cannot exceed 1,000,000,000."),
  currency: z.string().length(3).regex(/^[A-Z]{3}$/, "Use a 3-letter uppercase currency code."),
  spacing: z.coerce.number().finite().min(0, "Spacing cannot be negative.").max(100_000, "Spacing cannot exceed 100,000."),
  allow_rotation: z.boolean(),
  max_sheets: z.coerce.number().int().min(1).max(200),
  margin: z.coerce.number().finite().min(0, "Margin cannot be negative.").max(100_000, "Margin cannot exceed 100,000."),
}).superRefine((config, context) => {
  if (config.margin * 2 >= Math.min(config.length, config.width)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["margin"], message: "Margin must be less than half of both sheet dimensions." });
  }
});
type SheetFormInput = z.input<typeof sheetSchema>;
type SheetForm = z.output<typeof sheetSchema>;

const defaults: SheetForm = {
  length: 2440,
  width: 1220,
  material: "MDF",
  cost_per_sheet: 45,
  currency: "USD",
  spacing: 3,
  allow_rotation: true,
  max_sheets: 50,
  margin: 0,
};

function metric(value: number, precision = 1) {
  return value.toLocaleString(undefined, { maximumFractionDigits: precision });
}

function PartSummary({ order }: { order: Order }) {
  const materials = [...new Set(order.parts.map((part) => part.material?.trim()).filter(Boolean))];
  return <div className="order-summary"><div><strong>{order.name}</strong><span>{order.order_id} · {order.parts.length} part types · {order.parts.reduce((sum, part) => sum + part.quantity, 0)} instances</span></div><span>Part materials: {materials.join(", ") || "Not specified; selected stock material is assumed"}</span></div>;
}

export default function OptimizePage() {
  const [order, setOrder] = useState<Order | null>(null);
  const [savedOrders, setSavedOrders] = useState<Order[]>([]);
  const [csvErrors, setCsvErrors] = useState<CsvValidation["errors"]>([]);
  const [result, setResult] = useState<OptimizationResponse | null>(null);
  const [selected, setSelected] = useState<"baseline" | "optimized">("optimized");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<SheetFormInput, unknown, SheetForm>({
    resolver: zodResolver(sheetSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (!supabase) return;
    void supabase.from("production_orders").select("order_id,name,parts").order("created_at", { ascending: false })
      .then(({ data, error: loadError }) => {
        if (loadError) setError(`Could not load saved orders: ${loadError.message}`);
        else setSavedOrders((data ?? []).map((row) => ({ order_id: row.order_id, name: row.name, parts: row.parts as Part[] })));
      });
  }, []);

  async function loadSample() {
    setError("");
    try {
      setOrder(await api.sampleOrder());
      setResult(null);
      setNotice("Sample production order loaded from the FastAPI demo endpoint.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The sample order could not be loaded.");
    }
  }

  async function importCsv(file?: File) {
    if (!file) return;
    setUploading(true);
    setCsvErrors([]);
    setError("");
    setNotice("");
    try {
      const validation = await api.validateCsv(file);
      setCsvErrors(validation.errors);
      if (!validation.valid) {
        setError("CSV validation found one or more invalid rows. Correct the file before optimizing.");
        return;
      }
      const imported: Order = {
        order_id: `CSV-${Date.now().toString().slice(-7)}`,
        name: file.name.replace(/\.csv$/i, "").replace(/[-_]/g, " ") || "CSV production order",
        parts: validation.parts,
      };
      setOrder(imported);
      setResult(null);
      setNotice(`${validation.accepted_rows} CSV rows passed backend validation.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The CSV could not be validated.");
    } finally {
      setUploading(false);
    }
  }

  async function runOptimization(values: SheetForm) {
    if (!order) {
      setError("Load a production order or validate a CSV before running optimization.");
      return;
    }
    if (busy) return;
    const sheetMaterial = values.material.trim().toLocaleLowerCase();
    const incompatibleMaterials = [...new Set(
      order.parts
        .map((part) => part.material?.trim())
        .filter((material): material is string => Boolean(material))
        .filter((material) => material.toLocaleLowerCase() !== sheetMaterial),
    )];
    if (incompatibleMaterials.length) {
      setError(
        `Part material(s) ${incompatibleMaterials.join(", ")} do not match selected stock-sheet material "${values.material}". Run one optimization per material.`,
      );
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    setResult(null);
    try {
      const sheetConfig: SheetConfig = values;
      const analysis = await api.optimize(order, sheetConfig);
      setResult(analysis);
      setSelected("optimized");
      if (!analysis.baseline.validation.valid || !analysis.optimized.validation.valid) {
        setError("At least one layout failed independent geometric validation. Its metrics are not shown as successful.");
      } else if (isDemoMode) {
        setNotice("Analysis completed. Development demo history is held in bounded backend memory and is not durable.");
      } else {
        setNotice("Both validated algorithm results were saved to your authenticated account.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Optimization failed.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadReport(runId: string, kind: "json" | "placements.csv") {
    try {
      await api.downloadReport(runId, kind);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The report could not be downloaded.");
    }
  }

  const activeResult: AlgorithmResult | null = result ? result[selected] : null;

  return (
    <>
      <div className="page-header">
        <div><p className="eyebrow">CUTTING OPTIMIZER</p><h1>Plan a better cut.</h1><p className="page-description">Run two deterministic packing heuristics with identical stock constraints, then inspect validated layouts and area-based metrics.</p></div>
        <span className="mode-badge mode-live"><span /> REAL API ALGORITHMS</span>
      </div>
      {error && <div className="notice notice-error" role="alert"><AlertTriangle size={15} />{error}</div>}
      {notice && <div className="notice notice-info" role="status">{notice}</div>}
      {csvErrors.map((row, index) => <div className="notice notice-error" key={`${row.row}-${index}`}><strong>CSV row {row.row ?? "—"}:</strong> {row.errors.map((item) => item.msg).filter(Boolean).join("; ") || "Invalid row."}</div>)}

      <div className="optimize-grid">
        <div>
          <section className="card step-card">
            <h2 className="step-title"><span className="step-number">1</span> Select production order <small>Order input</small></h2>
            <div className="inline-actions" style={{ marginBottom: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => void loadSample()}><Sparkles size={13} /> Load sample order</button>
              <label className="btn btn-secondary" htmlFor="optimizer-csv"><FileUp size={13} /> {uploading ? "Validating…" : "Import CSV"}</label>
              <input id="optimizer-csv" type="file" accept=".csv,text/csv" className="sr-only" disabled={uploading} onChange={(event) => void importCsv(event.target.files?.[0])} />
            </div>
            {savedOrders.length > 0 && (
              <div className="field" style={{ marginBottom: 10 }}>
                <label htmlFor="saved-order">Or choose a saved order</label>
                <select id="saved-order" className="select" defaultValue="" onChange={(event) => {
                  const selectedOrder = savedOrders.find((item) => item.order_id === event.target.value);
                  if (selectedOrder) { setOrder(selectedOrder); setResult(null); setError(""); }
                }}>
                  <option value="" disabled>Select an order…</option>
                  {savedOrders.map((item) => <option value={item.order_id} key={item.order_id}>{item.name} · {item.order_id}</option>)}
                </select>
              </div>
            )}
            {order ? <PartSummary order={order} /> : <div className="empty compact"><h3>No order selected</h3><p>Load the sample order, choose a saved order, or validate a parts CSV.</p></div>}
          </section>

          <form onSubmit={handleSubmit(runOptimization)}>
            <section className="card step-card">
              <h2 className="step-title"><span className="step-number">2</span> Configure stock sheet <small>Physical constraints</small></h2>
              <div className="field-grid">
                <div className="field"><label htmlFor="length">Sheet length</label><input id="length" className="input" type="number" step="any" min="0" {...register("length")} />{errors.length && <span className="field-error">{errors.length.message}</span>}</div>
                <div className="field"><label htmlFor="width">Sheet width</label><input id="width" className="input" type="number" step="any" min="0" {...register("width")} />{errors.width && <span className="field-error">{errors.width.message}</span>}</div>
                <div className="field"><label htmlFor="material">Material</label><input id="material" className="input" {...register("material")} />{errors.material && <span className="field-error">{errors.material.message}</span>}</div>
                <div className="field"><label htmlFor="cost_per_sheet">Cost per sheet</label><input id="cost_per_sheet" className="input" type="number" step="any" min="0" {...register("cost_per_sheet")} />{errors.cost_per_sheet && <span className="field-error">{errors.cost_per_sheet.message}</span>}</div>
                <div className="field"><label htmlFor="currency">Currency</label><input id="currency" className="input" maxLength={3} {...register("currency")} />{errors.currency && <span className="field-error">{errors.currency.message}</span>}</div>
                <div className="field"><label htmlFor="spacing">Kerf / spacing allowance</label><input id="spacing" className="input" type="number" step="any" min="0" {...register("spacing")} /><small>Reserved on each part&apos;s positive x/y edges.</small>{errors.spacing && <span className="field-error">{errors.spacing.message}</span>}</div>
                <div className="field"><label htmlFor="max_sheets">Maximum sheets</label><input id="max_sheets" className="input" type="number" step="1" min="1" {...register("max_sheets")} />{errors.max_sheets && <span className="field-error">{errors.max_sheets.message}</span>}</div>
                <div className="field"><label htmlFor="margin">Stock margin</label><input id="margin" className="input" type="number" step="any" min="0" {...register("margin")} />{errors.margin && <span className="field-error">{errors.margin.message}</span>}</div>
              </div>
              <label className="check-row" style={{ marginTop: 12 }}><input type="checkbox" {...register("allow_rotation")} /> Allow 90° part rotation</label>
            </section>
            <section className="card step-card">
              <h2 className="step-title"><span className="step-number">3</span> Compare algorithms <small>Identical order and constraints</small></h2>
              <div className="algorithm-options">
                <div className="algorithm-option"><strong>First Fit Decreasing</strong><span>Area-descending instances placed in deterministic shelves; baseline comparison.</span></div>
                <div className="algorithm-option"><strong>MaxRects · Best Short Side Fit</strong><span>Free-rectangle heuristic. Not a global optimum or a guillotine-cut guarantee.</span></div>
              </div>
              <button type="submit" className="btn btn-primary full-width" disabled={busy || !order}>
                {busy ? <><LoaderCircle size={14} className="spin" /> Running both algorithms…</> : <><Play size={14} /> Run optimization</>}
              </button>
              <p className="hero-meta" style={{ marginBottom: 0 }}>Results are shown only after both layouts pass the independent validator.</p>
            </section>
          </form>
        </div>

        <section className="card" aria-live="polite">
          <div className="card-heading"><div><h2>Analysis results</h2><p>Physical area metrics · Reserved spacing is not subtracted twice</p></div>{result && <span className={`status-chip ${activeResult?.validation.valid ? "" : "invalid-chip"}`}>{activeResult?.validation.valid ? "Validated" : "Invalid"}</span>}</div>
          {!result ? (
            busy ? (
              <div className="optimization-loading" role="status" aria-busy="true">
                <div className="loading-mark"><Scissors size={23} /></div>
                <h3>Comparing cutting strategies</h3>
                <p>Running FFD and MaxRects against the selected order and stock constraints. Results appear after geometry validation.</p>
                <div className="loading-track"><span /></div>
                <div className="loading-caption">Packing parts · Validating placements · Calculating material use</div>
              </div>
            ) : (
              <div className="empty"><div className="empty-icon"><Sheet size={20} /></div><h3>Your comparison will appear here</h3><p>Choose an order and stock configuration, then run both algorithms to see actual placements and computed metrics.</p></div>
            )
          ) : (
            <>
              {result.baseline.validation.valid && result.optimized.validation.valid && (
                <div className="notice notice-success" style={{ margin: "0 14px" }}>
                  Validation passed for both layouts. Unused area is a proxy for offcut area, not a measure of reusable scrap.
                </div>
              )}
              {result.baseline.validation.valid && result.optimized.validation.valid && (
                <div className="notice notice-info" style={{ margin: "10px 14px 0" }}>
                  Experimental synthetic-data risk signal: <strong>{result.risk_prediction.risk_class}</strong>
                  {" · "}synthetic-model confidence {(result.risk_prediction.model_score * 100).toFixed(1)}% (not calibrated and not a real-world probability).
                  {" "}{result.risk_prediction.data_disclaimer}
                </div>
              )}
              {(!result.baseline.validation.valid || !result.optimized.validation.valid) && (
                <div className="notice notice-error" style={{ margin: "0 14px" }}>
                  {[
                    ...result.baseline.validation.errors.map((item) => `Baseline: ${item}`),
                    ...result.optimized.validation.errors.map((item) => `MaxRects: ${item}`),
                  ].join(" ")}
                </div>
              )}
              {result.baseline.validation.valid && result.optimized.validation.valid && (
                <div className="card" style={{ margin: "12px 14px 0", boxShadow: "none" }}>
                  <div className="card-heading"><div><h2>Baseline vs. optimized</h2><p>Estimated difference only; not guaranteed savings.</p></div></div>
                  <div className="metric-strip">
                    <div className="metric-mini"><span>Sheet-count difference</span><strong>{result.comparison.sheet_count_difference > 0 ? "+" : ""}{result.comparison.sheet_count_difference}</strong></div>
                    <div className="metric-mini"><span>Utilization improvement</span><strong>{result.comparison.improvements_valid && result.comparison.utilization_improvement_percentage_points !== null ? `${result.comparison.utilization_improvement_percentage_points > 0 ? "+" : ""}${metric(result.comparison.utilization_improvement_percentage_points)} pp` : "Not comparable"}</strong></div>
                    <div className="metric-mini"><span>Unused-area reduction</span><strong>{result.comparison.improvements_valid && result.comparison.estimated_unused_area_reduction !== null ? metric(result.comparison.estimated_unused_area_reduction, 0) : "Not comparable"}</strong></div>
                    <div className="metric-mini"><span>Estimated cost difference</span><strong>{result.comparison.improvements_valid && result.comparison.estimated_material_cost_difference !== null ? `${metric(result.comparison.estimated_material_cost_difference)} ${result.optimized.sheet_config.currency}` : "Not comparable"}</strong></div>
                    <div className="metric-mini"><span>Unplaced-part difference</span><strong>{result.comparison.unplaced_part_difference > 0 ? "+" : ""}{result.comparison.unplaced_part_difference}</strong></div>
                    <div className="metric-mini"><span>Runtime difference</span><strong>{result.comparison.runtime_difference_ms > 0 ? "+" : ""}{metric(result.comparison.runtime_difference_ms, 2)} ms</strong></div>
                  </div>
                </div>
              )}
              <div className="result-tabs" role="tablist" aria-label="Algorithm layout">
                <button role="tab" aria-selected={selected === "baseline"} className={`result-tab ${selected === "baseline" ? "result-tab-active" : ""}`} onClick={() => setSelected("baseline")}>First Fit Decreasing</button>
                <button role="tab" aria-selected={selected === "optimized"} className={`result-tab ${selected === "optimized" ? "result-tab-active" : ""}`} onClick={() => setSelected("optimized")}>MaxRects BSSF</button>
              </div>
              {activeResult?.validation.valid && (
                <>
                  <div className="metric-strip">
                    <div className="metric-mini"><span>Sheets used</span><strong>{activeResult.metrics.sheets_used}</strong></div>
                    <div className="metric-mini"><span>Utilization</span><strong>{metric(activeResult.metrics.utilization_percent)}%</strong></div>
                    <div className="metric-mini"><span>Placed / requested</span><strong>{activeResult.metrics.placed_parts} / {activeResult.metrics.total_requested_parts}</strong></div>
                    <div className="metric-mini"><span>Unused-area proxy</span><strong>{metric(activeResult.metrics.unused_area, 0)}</strong></div>
                    <div className="metric-mini"><span>Estimated sheet cost</span><strong>{activeResult.sheet_config.currency} {metric(activeResult.metrics.material_cost)}</strong></div>
                    <div className="metric-mini"><span>Runtime</span><strong>{metric(activeResult.runtime_ms, 2)} ms</strong></div>
                  </div>
                  <LayoutPreview result={activeResult} />
                  {activeResult.placements.length > 0 && (
                    <details className="placement-details">
                      <summary>Part placement details ({activeResult.placements.length})</summary>
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead><tr><th>Sheet</th><th>Part / instance</th><th>Origin X, Y</th><th>Placed size</th><th>Orientation</th></tr></thead>
                          <tbody>{activeResult.placements.slice(0, 100).map((part) => (
                            <tr key={part.instance_id}>
                              <td>{part.sheet_index + 1}</td>
                              <td><strong>{part.part_id}</strong><br /><span className="table-meta">{part.instance_id}</span></td>
                              <td>{metric(part.x, 2)}, {metric(part.y, 2)}</td>
                              <td>{metric(part.placed_length, 2)} × {metric(part.placed_width, 2)}</td>
                              <td>{part.rotated ? "Rotated 90°" : "As entered"}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                      {activeResult.placements.length > 100 && <p className="table-footnote">Showing the first 100 placements. Download the placements CSV for the complete result.</p>}
                    </details>
                  )}
                  {activeResult.unplaced_instances.length > 0 && (
                    <div className="notice notice-error" style={{ margin: "0 14px 14px" }}>
                      Unplaced instances ({activeResult.unplaced_instances.length}): {activeResult.unplaced_instances.map((item) => item.instance_id).join(", ")}
                    </div>
                  )}
                  <div className="inline-actions" style={{ padding: "0 14px 16px" }}>
                    <button className="btn btn-secondary" type="button" onClick={() => void downloadReport(activeResult.run_id, "json")}><ArrowDownToLine size={13} /> JSON report</button>
                    <button className="btn btn-secondary" type="button" onClick={() => void downloadReport(activeResult.run_id, "placements.csv")}><ArrowDownToLine size={13} /> Placements CSV</button>
                    {!isDemoMode && <span className="hero-meta">Saved to account history by the authenticated API.</span>}
                  </div>
                </>
              )}
              {activeResult && !activeResult.validation.valid && (
                <div className="empty compact"><h3>Metrics withheld</h3><p>This layout failed geometric validation. Do not rely on its placements or comparison figures.</p></div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
