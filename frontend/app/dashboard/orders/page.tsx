"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownToLine, FileUp, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "@/lib/api";
import { saveOrder } from "@/lib/persistence";
import { supabase } from "@/lib/supabase";
import type { Order, Part } from "@/types/api";

const partSchema = z.object({
  part_id: z.string().trim().min(1, "Part ID is required."),
  length: z.coerce.number().finite().positive("Length must be positive."),
  width: z.coerce.number().finite().positive("Width must be positive."),
  quantity: z.coerce.number().int().positive("Quantity must be a positive whole number."),
  priority: z.coerce.number().int().min(0).default(0),
  material: z.string().optional(),
  description: z.string().optional(),
});
const formSchema = z.object({
  order_id: z.string().trim().min(1, "Order ID is required."),
  name: z.string().trim().min(1, "Order name is required."),
  parts: z.array(partSchema).min(1, "Add at least one part."),
}).superRefine((value, context) => {
  const ids = value.parts.map((part) => part.part_id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["parts"], message: "Part IDs must be unique within an order." });
  }
});
type OrderFormInput = z.input<typeof formSchema>;
type OrderForm = z.output<typeof formSchema>;

const blankPart = (): OrderFormInput["parts"][number] => ({
  part_id: "", length: 1, width: 1, quantity: 1, priority: 0, material: "", description: "",
});

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [csvErrors, setCsvErrors] = useState<{ row: number | null; errors: { msg?: string }[] }[]>([]);
  const [csvParts, setCsvParts] = useState<Part[] | null>(null);
  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<OrderFormInput, unknown, OrderForm>({
    resolver: zodResolver(formSchema),
    defaultValues: { order_id: "", name: "", parts: [blankPart()] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "parts" });

  useEffect(() => {
    if (!supabase) return;
    void supabase.from("production_orders").select("order_id,name,parts").order("created_at", { ascending: false })
      .then(({ data, error: loadError }) => {
        if (loadError) setError(`Could not load saved orders: ${loadError.message}`);
        else setOrders((data ?? []).map((row) => ({
          order_id: row.order_id,
          name: row.name,
          parts: row.parts as Part[],
        })));
      });
  }, []);

  const visibleOrders = useMemo(
    () => orders.filter((order) => `${order.name} ${order.order_id}`.toLowerCase().includes(search.toLowerCase())),
    [orders, search],
  );

  async function submit(values: OrderForm) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const order: Order = { ...values, parts: values.parts };
      await saveOrder(order);
      setOrders((current) => [order, ...current.filter((item) => item.order_id !== order.order_id)]);
      setNotice(supabase ? "Order saved to your authenticated workspace." : "Order added for this page session only; demo mode does not persist data.");
      setEditingId(null);
      reset({ order_id: "", name: "", parts: [blankPart()] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The order could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function edit(order: Order) {
    setEditingId(order.order_id);
    reset({
      order_id: order.order_id,
      name: order.name,
      parts: order.parts.map((part) => ({
        ...blankPart(),
        ...part,
        priority: part.priority ?? 0,
        material: part.material ?? "",
        description: part.description ?? "",
      })),
    });
  }

  async function removeOrder(orderId: string) {
    setError("");
    if (supabase) {
      const { error: deleteError } = await supabase.from("production_orders").delete().eq("order_id", orderId);
      if (deleteError) {
        setError(`Could not delete the order: ${deleteError.message}`);
        return;
      }
    }
    setOrders((current) => current.filter((order) => order.order_id !== orderId));
    setNotice(supabase ? "Order deleted." : "Order removed from this page session.");
  }

  async function importCsv(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const validation = await api.validateCsv(file);
      setCsvErrors(validation.errors);
      setCsvParts(validation.parts);
      if (validation.valid) {
        const orderId = `CSV-${Date.now().toString().slice(-7)}`;
        reset({
          order_id: orderId,
          name: file.name.replace(/\.csv$/i, "").replace(/[-_]/g, " ") || "CSV production order",
          parts: validation.parts.map((part) => ({
            ...blankPart(),
            ...part,
            priority: part.priority ?? 0,
            material: part.material ?? "",
            description: part.description ?? "",
          })),
        });
        setEditingId(null);
        setNotice(`${validation.accepted_rows} CSV rows validated. Review the form, then save the order.`);
      }
    } catch (cause) {
      setCsvErrors([]);
      setCsvParts(null);
      setError(cause instanceof Error ? cause.message : "The CSV could not be validated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div><p className="eyebrow">ORDER MANAGEMENT</p><h1>Production orders</h1><p className="page-description">Build, validate, and maintain rectangular part orders before material planning.</p></div>
        <a className="btn btn-secondary" href="data:text/csv;charset=utf-8,part_id%2Clength%2Cwidth%2Cquantity%2Cpriority%2Cmaterial%2Cdescription%0APANEL-A%2C600%2C400%2C4%2C0%2CMDF%2CMain%20panel" download="scrapless-parts-template.csv"><ArrowDownToLine size={14} /> Sample CSV</a>
      </div>
      {notice && <div className="notice notice-success" role="status">{notice}</div>}
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <div className="dashboard-grid">
        <section className="card">
          <div className="card-heading"><div><h2>{editingId ? "Edit production order" : "Create production order"}</h2><p>Dimensions use the same units as your selected stock sheet.</p></div></div>
          <form onSubmit={handleSubmit(submit)} style={{ padding: "0 16px 16px" }}>
            <div className="field-grid">
              <div className="field"><label htmlFor="order_id">Order ID</label><input id="order_id" className={`input ${errors.order_id ? "input-error" : ""}`} readOnly={Boolean(editingId)} {...register("order_id")} />{errors.order_id && <span className="field-error">{errors.order_id.message}</span>}</div>
              <div className="field"><label htmlFor="order_name">Order name</label><input id="order_name" className={`input ${errors.name ? "input-error" : ""}`} {...register("name")} />{errors.name && <span className="field-error">{errors.name.message}</span>}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 0 8px" }}>
              <p className="section-label" style={{ margin: 0 }}>PARTS ({fields.length})</p>
              <button type="button" className="btn btn-quiet" onClick={() => append(blankPart())}><Plus size={13} /> Add part</button>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {fields.map((field, index) => (
                <div key={field.id} className="card" style={{ padding: 10, boxShadow: "none" }}>
                  <div className="field-grid">
                    <div className="field"><label htmlFor={`parts.${index}.part_id`}>Part ID</label><input id={`parts.${index}.part_id`} className="input" {...register(`parts.${index}.part_id`)} /></div>
                    <div className="field"><label htmlFor={`parts.${index}.length`}>Length</label><input id={`parts.${index}.length`} className="input" type="number" step="any" min="0" {...register(`parts.${index}.length`)} />{errors.parts?.[index]?.length && <span className="field-error">{errors.parts[index]?.length?.message}</span>}</div>
                    <div className="field"><label htmlFor={`parts.${index}.width`}>Width</label><input id={`parts.${index}.width`} className="input" type="number" step="any" min="0" {...register(`parts.${index}.width`)} />{errors.parts?.[index]?.width && <span className="field-error">{errors.parts[index]?.width?.message}</span>}</div>
                    <div className="field"><label htmlFor={`parts.${index}.quantity`}>Quantity</label><input id={`parts.${index}.quantity`} className="input" type="number" step="1" min="1" {...register(`parts.${index}.quantity`)} />{errors.parts?.[index]?.quantity && <span className="field-error">{errors.parts[index]?.quantity?.message}</span>}</div>
                    <div className="field"><label htmlFor={`parts.${index}.material`}>Material (optional)</label><input id={`parts.${index}.material`} className="input" {...register(`parts.${index}.material`)} /></div>
                    <div className="field"><label htmlFor={`parts.${index}.description`}>Description</label><input id={`parts.${index}.description`} className="input" {...register(`parts.${index}.description`)} /></div>
                  </div>
                  {fields.length > 1 && <button type="button" className="btn btn-quiet" style={{ marginTop: 6 }} onClick={() => remove(index)}><Trash2 size={12} /> Remove part</button>}
                </div>
              ))}
            </div>
            {errors.parts?.message && <p className="field-error">{errors.parts.message}</p>}
            <div className="inline-actions" style={{ marginTop: 14 }}>
              <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Validating…" : editingId ? "Update order" : "Save order"}</button>
              {editingId && <button className="btn btn-secondary" type="button" onClick={() => { setEditingId(null); reset({ order_id: "", name: "", parts: [blankPart()] }); }}>Cancel edit</button>}
            </div>
          </form>
        </section>

        <section className="card">
          <div className="card-heading"><div><h2>Import a part list</h2><p>UTF-8 CSV · 2 MB maximum · row-level feedback</p></div><FileUp size={17} color="#28714e" /></div>
          <div style={{ padding: "0 16px 16px" }}>
            <div className="field">
              <label htmlFor="csv-upload">Choose a CSV file</label>
              <input id="csv-upload" className="input" type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => void importCsv(event.target.files?.[0])} />
              <small>Required headers: part_id, length, width, quantity. Optional: priority, material, description.</small>
            </div>
            {csvParts && <div className={`notice ${csvErrors.length ? "notice-error" : "notice-success"}`} role={csvErrors.length ? "alert" : "status"}>{csvErrors.length ? `${csvErrors.length} invalid row(s). The invalid rows are not silently dropped; correct the file before importing.` : `${csvParts.length} valid part rows ready for review.`}</div>}
            {csvErrors.map((row, index) => <div className="notice notice-error" key={`${row.row}-${index}`}><strong>Row {row.row ?? "—"}:</strong> {row.errors.map((item) => item.msg).filter(Boolean).join("; ") || "Invalid values."}</div>)}
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 15 }}>
        <div className="card-heading">
          <div><h2>Saved orders</h2><p>{supabase ? "Rows are scoped by your authenticated Supabase account." : "Orders created in demo mode only exist until this page is refreshed."}</p></div>
          <div className="field" style={{ width: "min(240px, 42vw)" }}><div style={{ position: "relative" }}><Search size={14} style={{ position: "absolute", left: 9, top: 11, color: "#89959a" }} /><input aria-label="Search orders" className="input" style={{ paddingLeft: 29 }} placeholder="Search orders…" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div>
        </div>
        {visibleOrders.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Order</th><th>Part types</th><th>Part instances</th><th>Material</th><th>Actions</th></tr></thead>
              <tbody>{visibleOrders.map((order) => (
                <tr key={order.order_id}>
                  <td><strong>{order.name}</strong><br /><span className="table-meta">{order.order_id}</span></td>
                  <td>{order.parts.length}</td>
                  <td>{order.parts.reduce((sum, part) => sum + part.quantity, 0)}</td>
                  <td>{[...new Set(order.parts.map((part) => part.material).filter(Boolean))].join(", ") || "—"}</td>
                  <td><div className="inline-actions"><button className="btn btn-secondary" onClick={() => edit(order)}><Pencil size={12} /> Edit</button><button className="btn btn-danger" onClick={() => { if (window.confirm(`Delete “${order.name}”?`)) void removeOrder(order.order_id); }}><Trash2 size={12} /> Delete</button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="empty compact"><h3>No matching orders</h3><p>Create an order or validate a CSV to get started.</p></div>}
      </section>
    </>
  );
}
