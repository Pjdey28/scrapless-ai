"use client";

import type { AnalyticsOverview, AnalyticsTrend, Metrics, SheetConfig } from "@/types/api";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";

export async function loadAnalytics(): Promise<{ overview: AnalyticsOverview; trends: AnalyticsTrend[] }> {
  if (!supabase) {
    const [overview, trendResponse] = await Promise.all([api.overview(), api.trends()]);
    return { overview, trends: trendResponse.data };
  }

  const { data, error } = await supabase.from("optimization_runs")
    .select("created_at,order_name,order_id,algorithm,metrics,sheet_config")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load saved analytics: ${error.message}`);

  const trends: AnalyticsTrend[] = (data ?? []).map((row) => {
    const metrics = row.metrics as Metrics;
    return {
      date: row.created_at,
      run_id: `${row.order_id}-${row.algorithm}`,
      order_name: row.order_name,
      algorithm: row.algorithm,
      material: (row.sheet_config as SheetConfig).material,
      currency: (row.sheet_config as SheetConfig).currency,
      sheets_used: metrics.sheets_used,
      utilization: metrics.utilization_percent,
      unused_area: metrics.unused_area,
      material_cost: metrics.material_cost,
    };
  });
  const count = trends.length;
  const currencies = new Set(trends.map((item) => item.currency));
  const overview: AnalyticsOverview = {
    mode: "Authenticated Supabase records; filtered by Row Level Security",
    run_count: count,
    sheets_used: trends.reduce((sum, item) => sum + item.sheets_used, 0),
    requested_parts: (data ?? []).reduce((sum, row) => sum + (row.metrics as Metrics).total_requested_parts, 0),
    average_utilization_percent: count ? trends.reduce((sum, item) => sum + item.utilization, 0) / count : null,
    estimated_unused_area: trends.reduce((sum, item) => sum + item.unused_area, 0),
    estimated_material_cost: currencies.size <= 1
      ? trends.reduce((sum, item) => sum + item.material_cost, 0)
      : null,
    cost_currency: currencies.size === 1 ? [...currencies][0] : null,
  };
  return { overview, trends };
}
