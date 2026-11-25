import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: null }));

import { deleteDemoOrders, insertDemoOrders, loadOrders, saveOrder } from "@/lib/persistence";
import type { DemoDatasetRecord, SavedOrder } from "@/types/api";

const demoRecord: DemoDatasetRecord = {
  order: {
    order_id: "APX-DEMO-V1-001",
    name: "Press frame reinforcement",
    parts: [{ part_id: "PLATE", length: 400, width: 250, quantity: 2, material: "Mild steel" }],
  },
  sheet_config: {
    length: 2500,
    width: 1250,
    material: "Mild steel",
    cost_per_sheet: 185,
    currency: "USD",
    spacing: 3,
    allow_rotation: true,
    max_sheets: 50,
    margin: 0,
  },
  metadata: {
    dataset_id: "apex-industrial-components-v1",
    customer_name: "Northstar Equipment",
    created_at: "2026-11-01",
    due_date: "2026-11-08",
    priority: "urgent",
    status: "ready",
    workload_profile: "small-batch",
    rotation_sensitive: false,
    timestamp_is_simulated: true,
  },
};

describe("demo order persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists local orders across reload-like reads and inserts the dataset idempotently", async () => {
    const first = await insertDemoOrders([demoRecord], []);
    const second = await insertDemoOrders([demoRecord], await loadOrders());

    expect(first).toEqual({ created: 1, skipped: 0, failures: [] });
    expect(second).toEqual({ created: 0, skipped: 1, failures: [] });
    expect(await loadOrders()).toHaveLength(1);
    expect((await loadOrders())[0].metadata?.sheet_config).toEqual(demoRecord.sheet_config);
  });

  it("does not overwrite user orders and reset removes only marked demo records", async () => {
    const userOrder: SavedOrder = {
      order_id: demoRecord.order.order_id,
      name: "User-owned order with a conflicting ID",
      parts: demoRecord.order.parts,
    };
    await saveOrder(userOrder);
    const seeded = await insertDemoOrders([demoRecord], await loadOrders());
    await saveOrder({
      order_id: "USER-ORDER",
      name: "Keep me",
      parts: demoRecord.order.parts,
    });

    expect(seeded.created).toBe(0);
    expect(seeded.failures).toHaveLength(1);
    expect(await deleteDemoOrders("apex-industrial-components-v1")).toBe(0);
    expect((await loadOrders()).map((order) => order.order_id)).toEqual([
      "USER-ORDER",
      "APX-DEMO-V1-001",
    ]);
  });

  it("removes demo rows while retaining non-demo rows", async () => {
    await insertDemoOrders([demoRecord], []);
    await saveOrder({
      order_id: "REAL-ORDER",
      name: "Real order",
      parts: demoRecord.order.parts,
    });

    expect(await deleteDemoOrders("apex-industrial-components-v1")).toBe(1);
    expect((await loadOrders()).map((order) => order.order_id)).toEqual(["REAL-ORDER"]);
  });
});
