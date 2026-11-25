"use client";

import { supabase } from "@/lib/supabase";
import type { AlgorithmResult, OptimizationResponse, Order } from "@/types/api";

export async function saveOrder(order: Order): Promise<void> {
  if (!supabase) return;
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("Sign in before saving an order.");
  const { error } = await supabase.from("production_orders").upsert(
    {
      user_id: userData.user.id,
      order_id: order.order_id,
      name: order.name,
      parts: order.parts,
    },
    { onConflict: "user_id,order_id" },
  );
  if (error) throw error;
}

export async function saveRun(
  result: AlgorithmResult,
  response: OptimizationResponse,
  order: Order,
): Promise<void> {
  if (!supabase) return;
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("Sign in before saving an optimization.");
  const { error } = await supabase.from("optimization_runs").insert({
    run_id: result.run_id,
    user_id: userData.user.id,
    order_id: result.order_id,
    order_name: result.order_name,
    algorithm: result.algorithm,
    validation_status: result.validation.valid ? "valid" : "invalid",
    metrics: result.metrics,
    payload: result,
    report_payload: {
      generated_at: new Date().toISOString(),
      software_version: "0.1.0",
      input_order: order,
      analysis: result,
      comparison: response.comparison,
      risk_prediction: response.risk_prediction,
    },
    sheet_config: result.sheet_config,
  });
  if (error) throw error;
}
