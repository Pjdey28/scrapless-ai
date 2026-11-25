"use client";

import { supabase } from "@/lib/supabase";
import type { DemoDatasetRecord, SavedOrder } from "@/types/api";

const DEMO_ORDERS_KEY = "scrapless.orders.v1";
const ORDER_COLUMNS = "order_id,name,parts,metadata,demo_dataset_id";

function localOrders(): SavedOrder[] {
  const raw = window.localStorage.getItem(DEMO_ORDERS_KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Local demo order storage is invalid.");
  return parsed as SavedOrder[];
}

function mapSupabaseOrder(row: {
  order_id: string;
  name: string;
  parts: unknown;
  metadata: unknown;
  demo_dataset_id: string | null;
}): SavedOrder {
  return {
    order_id: row.order_id,
    name: row.name,
    parts: row.parts as SavedOrder["parts"],
    metadata: row.metadata as SavedOrder["metadata"],
    demo_dataset_id: row.demo_dataset_id,
  };
}

export async function loadOrders(): Promise<SavedOrder[]> {
  if (!supabase) return localOrders();
  const { data, error } = await supabase.from("production_orders")
    .select(ORDER_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load saved orders: ${error.message}`);
  return (data ?? []).map(mapSupabaseOrder);
}

export async function saveOrder(order: SavedOrder): Promise<void> {
  if (!supabase) {
    const orders = localOrders();
    window.localStorage.setItem(
      DEMO_ORDERS_KEY,
      JSON.stringify([order, ...orders.filter((item) => item.order_id !== order.order_id)]),
    );
    return;
  }
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("Sign in before saving an order.");
  const { error } = await supabase.from("production_orders").upsert(
    {
      user_id: userData.user.id,
      order_id: order.order_id,
      name: order.name,
      parts: order.parts,
      metadata: order.metadata ?? {},
      demo_dataset_id: order.demo_dataset_id ?? null,
    },
    { onConflict: "user_id,order_id" },
  );
  if (error) throw new Error(`Could not save order: ${error.message}`);
}

export async function insertDemoOrders(
  records: DemoDatasetRecord[],
  existingOrders: SavedOrder[],
): Promise<{ created: number; skipped: number; failures: { order_id: string; detail: string }[] }> {
  const existingById = new Map(existingOrders.map((order) => [order.order_id, order]));
  const datasetId = records[0]?.metadata.dataset_id;
  const skipped = records.filter(
    (record) => existingById.get(record.order.order_id)?.demo_dataset_id === datasetId,
  ).length;
  const pending = records.filter((record) => !existingById.has(record.order.order_id));
  const failures: { order_id: string; detail: string }[] = records
    .filter((record) => {
      const existing = existingById.get(record.order.order_id);
      return existing && existing.demo_dataset_id !== datasetId;
    })
    .map((record) => ({
      order_id: record.order.order_id,
      detail: "Order ID is already used by non-demo data.",
    }));

  if (!supabase) {
    const current = localOrders();
    let created = 0;
    for (const record of pending) {
      current.unshift({
        ...record.order,
        metadata: { ...record.metadata, sheet_config: record.sheet_config },
        demo_dataset_id: record.metadata.dataset_id,
      });
      created += 1;
    }
    window.localStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(current));
    return { created, skipped, failures };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the current user: ${userError.message}`);
  if (!userData.user) throw new Error("Sign in before loading a demo workspace.");

  let created = 0;
  for (const record of pending) {
    try {
      const { error } = await supabase.from("production_orders").insert({
        user_id: userData.user.id,
        order_id: record.order.order_id,
        name: record.order.name,
        parts: record.order.parts,
        metadata: { ...record.metadata, sheet_config: record.sheet_config },
        demo_dataset_id: record.metadata.dataset_id,
      });
      if (error) throw error;
      created += 1;
    } catch (cause) {
      failures.push({
        order_id: record.order.order_id,
        detail: cause instanceof Error ? cause.message : "The order could not be inserted.",
      });
    }
  }
  return { created, skipped, failures };
}

export async function deleteDemoOrders(datasetId: string): Promise<number> {
  if (!supabase) {
    const current = localOrders();
    const remaining = current.filter((order) => order.demo_dataset_id !== datasetId);
    window.localStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(remaining));
    return current.length - remaining.length;
  }
  const { data, error } = await supabase.from("production_orders")
    .delete()
    .eq("demo_dataset_id", datasetId)
    .select("order_id");
  if (error) throw new Error(`Could not remove demo orders: ${error.message}`);
  return data?.length ?? 0;
}

export async function deleteOrder(orderId: string): Promise<void> {
  if (!supabase) {
    const current = localOrders();
    window.localStorage.setItem(
      DEMO_ORDERS_KEY,
      JSON.stringify(current.filter((order) => order.order_id !== orderId)),
    );
    return;
  }
  const { error } = await supabase.from("production_orders").delete().eq("order_id", orderId);
  if (error) throw new Error(`Could not delete the order: ${error.message}`);
}
