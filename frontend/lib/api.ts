import type {
  AnalyticsOverview,
  AnalyticsTrend,
  CsvValidation,
  HistoryEntry,
  ModelEvaluation,
  OptimizationResponse,
  Order,
  RiskPrediction,
  SheetConfig,
  VisionResponse,
} from "@/types/api";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    if (!response.ok) {
      let detail = `Request failed (${response.status}).`;
      try {
        const body = await response.json();
        detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
      } catch {
        // Keep the HTTP status as a useful fallback when the server sends no JSON.
      }
      throw new Error(detail);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The API request timed out. Check the backend and retry.");
    }
    if (error instanceof TypeError) {
      throw new Error(`Could not reach the ScrapLess API at ${API_BASE}. Start the backend and retry.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export const api = {
  sampleOrder: () => request<Order>("/api/v1/demo/sample-order"),
  validateCsv: (file: File) => {
    const form = new FormData();
    form.set("file", file);
    return request<CsvValidation>("/api/v1/orders/validate", { method: "POST", body: form });
  },
  optimize: (order: Order, sheetConfig: SheetConfig) =>
    request<OptimizationResponse>("/api/v1/optimize", {
      method: "POST",
      body: JSON.stringify({ order, sheet_config: sheetConfig }),
    }),
  overview: () => request<AnalyticsOverview>("/api/v1/analytics/overview"),
  trends: () => request<{ mode: string; data: AnalyticsTrend[] }>("/api/v1/analytics/trends"),
  history: () => request<HistoryEntry[]>("/api/v1/history"),
  risk: (order: Order, sheetConfig: SheetConfig) =>
    request<RiskPrediction>("/api/v1/ml/predict-risk", {
      method: "POST",
      body: JSON.stringify({ order, sheet_config: sheetConfig }),
    }),
  modelEvaluation: () => request<ModelEvaluation>("/api/v1/ml/evaluation"),
  vision: (file: File, threshold: number, minimumArea: number) => {
    const form = new FormData();
    form.set("file", file);
    return request<VisionResponse>(
      `/api/v1/vision/detect?threshold=${threshold}&minimum_area=${minimumArea}`,
      { method: "POST", body: form },
    );
  },
};

export function reportUrl(runId: string, kind: "json" | "placements.csv"): string {
  return `${API_BASE}/api/v1/reports/${encodeURIComponent(runId)}/${kind}`;
}
