import random
from collections.abc import Callable

import pytest
from app.optimization.packing import first_fit_decreasing, maxrects_bssf
from app.optimization.validation import validate_layout
from app.schemas import AlgorithmResult, Order, Part, Placement, SheetConfig


def order(parts: list[Part]) -> Order:
    return Order(order_id="test-order", name="Test order", parts=parts)


def sheet(**overrides: object) -> SheetConfig:
    config = {"length": 100, "width": 100, "material": "MDF", "max_sheets": 10}
    config.update(overrides)
    return SheetConfig(**config)


def test_both_algorithms_place_parts_and_validate() -> None:
    production_order = order([Part(part_id="A", length=60, width=40, quantity=2)])
    for algorithm in (first_fit_decreasing, maxrects_bssf):
        result = algorithm(production_order, sheet())
        assert result.metrics.placed_parts == 2
        assert result.metrics.unplaced_parts == 0
        assert result.validation.valid
        assert len({placement.instance_id for placement in result.placements}) == 2


def test_rotation_is_respected() -> None:
    production_order = order([Part(part_id="A", length=70, width=40, quantity=1)])
    rotated = first_fit_decreasing(
        production_order, sheet(length=80, width=50, allow_rotation=True)
    )
    fixed = first_fit_decreasing(production_order, sheet(length=80, width=50, allow_rotation=False))
    assert rotated.metrics.placed_parts == 1
    assert rotated.placements[0].rotated
    assert fixed.metrics.unplaced_parts == 1


def test_oversized_parts_are_reported_unplaced() -> None:
    result = maxrects_bssf(
        order([Part(part_id="TOO-BIG", length=200, width=200, quantity=1)]), sheet()
    )
    assert result.metrics.unplaced_parts == 1
    assert result.unplaced_instances[0]["part_id"] == "TOO-BIG"


def test_spacing_is_reserved_between_parts() -> None:
    production_order = order([Part(part_id="A", length=50, width=50, quantity=2)])
    result = maxrects_bssf(production_order, sheet(length=110, width=110, spacing=1))
    assert result.validation.valid
    a, b = result.placements
    assert (
        a.x + a.placed_length + 1 <= b.x
        or b.x + b.placed_length + 1 <= a.x
        or a.y + a.placed_width + 1 <= b.y
        or b.y + b.placed_width + 1 <= a.y
    )


def test_metrics_use_physical_area_and_zero_sheet_denominator() -> None:
    result = first_fit_decreasing(
        order([Part(part_id="A", length=50, width=50, quantity=1)]),
        sheet(length=100, width=100, spacing=2, cost_per_sheet=25),
    )
    assert result.metrics.placed_area == 2500
    assert result.metrics.utilization_percent == 25
    assert result.metrics.unused_area == 7500
    assert result.metrics.material_cost == 25
    empty = first_fit_decreasing(
        order([Part(part_id="A", length=200, width=200, quantity=1)]), sheet()
    )
    assert empty.metrics.sheets_used == 0
    assert empty.metrics.utilization_percent == 0
    assert empty.metrics.unused_area_percent == 0
    assert empty.metrics.estimated_cost_per_placed_part is None


def test_validator_detects_out_of_bounds_and_overlap() -> None:
    production_order = order([Part(part_id="A", length=40, width=40, quantity=2)])
    invalid = [
        Placement(
            sheet_index=0,
            part_id="A",
            instance_id="A-00001",
            original_length=40,
            original_width=40,
            placed_length=40,
            placed_width=40,
            x=70,
            y=0,
            rotated=False,
        ),
        Placement(
            sheet_index=0,
            part_id="A",
            instance_id="A-00002",
            original_length=40,
            original_width=40,
            placed_length=40,
            placed_width=40,
            x=40,
            y=0,
            rotated=False,
        ),
    ]
    validation = validate_layout(production_order, sheet(), invalid, [])
    assert not validation.valid
    assert any("exceeds sheet boundaries" in issue for issue in validation.errors)
    assert any("overlap" in issue for issue in validation.errors)


def test_algorithms_are_deterministic_except_run_identifier() -> None:
    production_order = order(
        [
            Part(part_id="B", length=30, width=40, quantity=2),
            Part(part_id="A", length=25, width=20, quantity=3),
        ]
    )
    for algorithm in (first_fit_decreasing, maxrects_bssf):
        first = algorithm(production_order, sheet())
        second = algorithm(production_order, sheet())
        assert [p.model_dump(exclude={"run_id"}) for p in first.placements] == [
            p.model_dump(exclude={"run_id"}) for p in second.placements
        ]
        assert first.unplaced_instances == second.unplaced_instances


@pytest.mark.parametrize("algorithm", [first_fit_decreasing, maxrects_bssf])
def test_seeded_layouts_reconcile_all_instances(
    algorithm: Callable[[Order, SheetConfig], AlgorithmResult],
) -> None:
    rng = random.Random(42)
    for case_number in range(12):
        parts = [
            Part(
                part_id=f"P-{index}",
                length=rng.randint(5, 65),
                width=rng.randint(5, 65),
                quantity=rng.randint(1, 4),
            )
            for index in range(8)
        ]
        result = algorithm(
            order(parts),
            sheet(length=100, width=100, spacing=1, max_sheets=12),
        )
        assert result.validation.valid, (case_number, result.validation.errors)
        assert (
            result.metrics.placed_parts + result.metrics.unplaced_parts
            == result.metrics.total_requested_parts
        )
