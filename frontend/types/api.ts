export interface Part {
  part_id: string;
  length: number;
  width: number;
  quantity: number;
  priority?: number;
  material?: string | null;
  description?: string | null;
}

export interface Order {
  order_id: string;
  name: string;
  parts: Part[];
}

export interface DemoOrderMetadata {
  dataset_id: string;
  customer_name: string;
  created_at: string;
  due_date: string;
  priority: "urgent" | "high" | "normal" | "low";
  status: "in production" | "ready" | "queued";
  workload_profile: "small-batch" | "mixed-production" | "high-volume";
  rotation_sensitive: boolean;
  timestamp_is_simulated: true;
  sheet_config?: SheetConfig;
}

export interface SavedOrder extends Order {
  metadata?: Partial<DemoOrderMetadata>;
  demo_dataset_id?: string | null;
}

export interface DemoDatasetRecord {
  order: Order;
  sheet_config: SheetConfig;
  metadata: DemoOrderMetadata;
}

export interface DemoDataset {
  dataset_id: string;
  company_name: string;
  description: string;
  records: DemoDatasetRecord[];
}

export interface SheetConfig {
  length: number;
  width: number;
  material: string;
  cost_per_sheet: number;
  currency: string;
  spacing: number;
  allow_rotation: boolean;
  max_sheets: number;
  margin: number;
}

export interface Placement {
  sheet_index: number;
  part_id: string;
  instance_id: string;
  original_length: number;
  original_width: number;
  placed_length: number;
  placed_width: number;
  x: number;
  y: number;
  rotated: boolean;
  status: "placed";
}

export interface Metrics {
  total_requested_parts: number;
  placed_parts: number;
  unplaced_parts: number;
  sheets_used: number;
  stock_area: number;
  placed_area: number;
  unused_area: number;
  utilization_percent: number;
  unused_area_percent: number;
  material_cost: number;
  estimated_cost_per_placed_part: number | null;
  runtime_ms: number;
  validation_status: "valid" | "invalid";
}

export interface AlgorithmResult {
  run_id: string;
  algorithm: "first_fit_decreasing" | "maxrects_bssf";
  order_id: string;
  order_name: string;
  sheet_config: SheetConfig;
  placements: Placement[];
  unplaced_instances: { part_id: string; instance_id: string }[];
  runtime_ms: number;
  algorithm_config: Record<string, string | number | boolean>;
  validation: { valid: boolean; errors: string[] };
  metrics: Metrics;
}

export interface OptimizationResponse {
  baseline: AlgorithmResult;
  optimized: AlgorithmResult;
  comparison: {
    sheet_count_difference: number;
    utilization_improvement_percentage_points: number | null;
    estimated_unused_area_reduction: number | null;
    estimated_material_cost_difference: number | null;
    unplaced_part_difference: number;
    runtime_difference_ms: number;
    improvements_valid: boolean;
  };
  risk_prediction: RiskPrediction;
  synthetic_data_disclaimer: string;
}

export interface CsvValidation {
  valid: boolean;
  accepted_rows: number;
  parts: Part[];
  errors: { row: number | null; errors: { msg?: string }[] }[];
}

export interface AnalyticsOverview {
  mode: string;
  demo_result_count?: number;
  run_count: number;
  sheets_used: number;
  requested_parts: number;
  average_utilization_percent: number | null;
  estimated_unused_area: number;
  estimated_material_cost: number | null;
  cost_currency: string | null;
}

export interface AnalyticsTrend {
  date: string;
  run_id: string;
  order_id: string;
  order_name: string;
  algorithm: string;
  material: string;
  currency: string;
  sheets_used: number;
  utilization: number;
  unused_area: number;
  material_cost: number;
  demo_dataset_id?: string | null;
  timestamp_is_simulated?: boolean;
}

export interface HistoryEntry {
  created_at: string;
  result: AlgorithmResult;
  report_payload?: Record<string, unknown> | null;
  demo_dataset_id?: string | null;
}

export interface DemoOptimizationOutcome {
  order_id: string;
  success: boolean;
  run_ids: string[];
  baseline_valid: boolean | null;
  optimized_valid: boolean | null;
  detail: string | null;
}

export interface RiskPrediction {
  risk_class: "high" | "lower";
  model_score: number;
  feature_importance: { feature: string; importance: number }[];
  explanation: string;
  model_version: string;
  data_disclaimer: string;
  features: Record<string, number>;
}

export interface ModelEvaluation {
  training_rows: number;
  testing_rows: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  confusion_matrix: number[][];
  feature_importance: { feature: string; importance: number }[];
  model_version: string;
  data_disclaimer: string;
}

export interface VisionResponse {
  candidate_count: number;
  regions: {
    x: number;
    y: number;
    width: number;
    height: number;
    contour_area_pixels: number;
  }[];
  annotated_image_base64: string;
  units: "pixels";
  limitation: string;
}
