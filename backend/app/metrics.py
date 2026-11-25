from __future__ import annotations

from app.schemas import Metrics, Order, Placement, SheetConfig


def calculate_metrics(
    order: Order,
    sheet: SheetConfig,
    placements: list[Placement],
    sheets_used: int,
    runtime_ms: float,
    validation_valid: bool,
) -> Metrics:
    requested = sum(part.quantity for part in order.parts)
    placed = len(placements)
    stock_area = sheets_used * sheet.length * sheet.width
    placed_area = sum(item.placed_length * item.placed_width for item in placements)
    unused_area = max(0.0, stock_area - placed_area)
    utilization = placed_area / stock_area * 100 if stock_area else 0.0
    unused_percent = unused_area / stock_area * 100 if stock_area else 0.0
    cost = sheets_used * sheet.cost_per_sheet
    return Metrics(
        total_requested_parts=requested,
        placed_parts=placed,
        unplaced_parts=requested - placed,
        sheets_used=sheets_used,
        stock_area=stock_area,
        placed_area=placed_area,
        unused_area=unused_area,
        utilization_percent=utilization,
        unused_area_percent=unused_percent,
        material_cost=cost,
        estimated_cost_per_placed_part=cost / placed if placed else None,
        runtime_ms=runtime_ms,
        validation_status="valid" if validation_valid else "invalid",
    )
