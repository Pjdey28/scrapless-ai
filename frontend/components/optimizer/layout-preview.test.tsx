import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LayoutPreview } from "@/components/optimizer/layout-preview";
import type { AlgorithmResult } from "@/types/api";

const result: AlgorithmResult = {
  run_id: "layout-test",
  algorithm: "maxrects_bssf",
  order_id: "order-test",
  order_name: "Test layout",
  sheet_config: {
    length: 100,
    width: 80,
    material: "MDF",
    cost_per_sheet: 20,
    currency: "USD",
    spacing: 2,
    allow_rotation: true,
    max_sheets: 1,
    margin: 0,
  },
  placements: [{
    sheet_index: 0,
    part_id: "PANEL",
    instance_id: "PANEL-00001",
    original_length: 30,
    original_width: 20,
    placed_length: 30,
    placed_width: 20,
    x: 4,
    y: 6,
    rotated: false,
    status: "placed",
  }],
  unplaced_instances: [],
  runtime_ms: 1,
  algorithm_config: {},
  validation: { valid: true, errors: [] },
  metrics: {
    total_requested_parts: 1,
    placed_parts: 1,
    unplaced_parts: 0,
    sheets_used: 1,
    stock_area: 8000,
    placed_area: 600,
    unused_area: 7400,
    utilization_percent: 7.5,
    unused_area_percent: 92.5,
    material_cost: 20,
    estimated_cost_per_placed_part: 20,
    runtime_ms: 1,
    validation_status: "valid",
  },
};

describe("LayoutPreview", () => {
  it("renders a physical placement using sheet dimensions", () => {
    render(<LayoutPreview result={result} />);
    expect(screen.getByRole("img", { name: "Cutting layout for stock sheet 1" })).toHaveAttribute("viewBox", "0 0 80 100");
    expect(screen.getByText("PANEL")).toBeInTheDocument();
    expect(screen.getByText(/lower-left sheet origin/)).toBeInTheDocument();
  });
});
