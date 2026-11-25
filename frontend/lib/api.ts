import type {
  AnalyticsOverview,
  AnalyticsTrend,
  CsvValidation,
  DemoDataset,
  DemoOptimizationOutcome,
  HistoryEntry,
  ModelEvaluation,
  OptimizationResponse,
  Order,
  RiskPrediction,
  SheetConfig,
  VisionResponse,
} from "@/types/api";
import { supabase } from "@/lib/supabase";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

async function authenticationHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Could not read the authenticated session: ${error.message}`);
  if (!data.session?.access_token) throw new Error("Sign in to access your account data.");
  return { Authorization: `Bearer ${data.session.access_token}` };
}

async function responseError(response: Response): Promise<Error> {
  let detail = `Request failed (${response.status}).`;
  try {
    const body = await response.json();
    detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
  } catch {
    // Keep the HTTP status as a useful fallback when the server sends no JSON.
  }
  return new Error(detail);
}

async function request<T>(
  path: string,
  init?: RequestInit,
  requiresAuth = true,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);
  try {
    const auth = requiresAuth ? await authenticationHeaders() : {};
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
        ...auth,
      },
    });
    if (!response.ok) throw await responseError(response);
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
  sampleOrder: () => request<Order>("/api/v1/demo/sample-order", undefined, false),
  demoDataset: () => request<DemoDataset>("/api/v1/demo/dataset", undefined, false),
  optimizeDemoBatch: (datasetId: string, orderIds: string[]) =>
    request<{ dataset_id: string; outcomes: DemoOptimizationOutcome[] }>("/api/v1/demo/workspace/optimize", {
      method: "POST",
      body: JSON.stringify({ dataset_id: datasetId, order_ids: orderIds }),
    }),
  resetDemoWorkspace: (datasetId: string) =>
    request<{ dataset_id: string; optimization_records_deleted: number }>(
      `/api/v1/demo/workspace/${encodeURIComponent(datasetId)}`,
      { method: "DELETE" },
    ),
  sampleLayout: async (): Promise<File> => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(`${API_BASE}/api/v1/demo/sample-layout.png`, {
        signal: controller.signal,
      });
      if (!response.ok) throw await responseError(response);
      return new File([await response.blob()], "scrapless-cutting-layout-sample.png", {
        type: "image/png",
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("The sample image request timed out. Check the backend and retry.");
      }
      if (error instanceof TypeError) {
        throw new Error(`Could not reach the ScrapLess API at ${API_BASE}.`);
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  },
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
  modelEvaluation: () => request<ModelEvaluation>("/api/v1/ml/evaluation", undefined, false),
  vision: (file: File, threshold: number, minimumArea: number) => {
    const form = new FormData();
    form.set("file", file);
    return request<VisionResponse>(
      `/api/v1/vision/detect?threshold=${threshold}&minimum_area=${minimumArea}`,
      { method: "POST", body: form },
    );
  },
  downloadReport: async (runId: string, kind: "json" | "placements.csv"): Promise<void> => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const auth = await authenticationHeaders();
      const response = await fetch(
        `${API_BASE}/api/v1/reports/${encodeURIComponent(runId)}/${kind}`,
        { headers: auth, signal: controller.signal },
      );
      if (!response.ok) throw await responseError(response);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = kind === "json"
        ? `scrapless-${runId}.json`
        : `scrapless-${runId}-placements.csv`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("The report request timed out. Check the backend and retry.");
      }
      if (error instanceof TypeError) {
        throw new Error(`Could not reach the ScrapLess API at ${API_BASE}.`);
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  },
};
