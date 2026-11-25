from __future__ import annotations

from app.schemas import Order, Placement, SheetConfig, ValidationResult


def expected_instances(order: Order) -> dict[str, str]:
    return {
        f"{part.part_id}-{number:05d}": part.part_id
        for part in order.parts
        for number in range(1, part.quantity + 1)
    }


def validate_layout(
    order: Order,
    sheet: SheetConfig,
    placements: list[Placement],
    unplaced: list[dict[str, str]],
) -> ValidationResult:
    errors: list[str] = []
    expected = expected_instances(order)
    ids = [placement.instance_id for placement in placements]
    unplaced_ids = [item["instance_id"] for item in unplaced]
    seen = ids + unplaced_ids
    if len(seen) != len(set(seen)):
        errors.append("An instance appears more than once across placed and unplaced results.")
    if set(seen) != set(expected):
        errors.append(
            "Requested part instances do not reconcile with placed and unplaced instances."
        )
    for item in unplaced:
        if item["instance_id"] not in expected:
            errors.append(f"Unexpected unplaced instance ID: {item['instance_id']}.")
        elif item["part_id"] != expected[item["instance_id"]]:
            errors.append(f"Part ID does not match unplaced instance {item['instance_id']}.")
    part_by_id = {part.part_id: part for part in order.parts}
    usable_width = sheet.width - 2 * sheet.margin
    usable_height = sheet.length - 2 * sheet.margin
    for placement in placements:
        if placement.instance_id not in expected:
            errors.append(f"Unexpected instance ID: {placement.instance_id}.")
            continue
        if placement.part_id != expected[placement.instance_id]:
            errors.append(f"Part ID does not match instance {placement.instance_id}.")
        part = part_by_id[placement.part_id]
        if placement.placed_length <= 0 or placement.placed_width <= 0:
            errors.append(f"Non-positive dimensions for {placement.instance_id}.")
        if placement.rotated:
            if not sheet.allow_rotation or (placement.placed_length, placement.placed_width) != (
                part.width,
                part.length,
            ):
                errors.append(f"Invalid rotation for {placement.instance_id}.")
        elif (placement.placed_length, placement.placed_width) != (part.length, part.width):
            errors.append(f"Placed dimensions differ from input for {placement.instance_id}.")
        if placement.sheet_index >= sheet.max_sheets:
            errors.append(f"Sheet index exceeds configured maximum for {placement.instance_id}.")
        local_x, local_y = placement.x - sheet.margin, placement.y - sheet.margin
        if (
            local_x < -1e-8
            or local_y < -1e-8
            or local_x + placement.placed_length + sheet.spacing > usable_width + 1e-8
            or local_y + placement.placed_width + sheet.spacing > usable_height + 1e-8
        ):
            errors.append(
                f"Placement {placement.instance_id} (including reserved spacing) exceeds sheet boundaries."
            )
    by_sheet: dict[int, list[Placement]] = {}
    for placement in placements:
        by_sheet.setdefault(placement.sheet_index, []).append(placement)
    for sheet_index, on_sheet in by_sheet.items():
        for index, first in enumerate(on_sheet):
            for second in on_sheet[index + 1 :]:
                separated = (
                    first.x + first.placed_length + sheet.spacing <= second.x + 1e-8
                    or second.x + second.placed_length + sheet.spacing <= first.x + 1e-8
                    or first.y + first.placed_width + sheet.spacing <= second.y + 1e-8
                    or second.y + second.placed_width + sheet.spacing <= first.y + 1e-8
                )
                if not separated:
                    errors.append(
                        f"Placements {first.instance_id} and {second.instance_id} overlap or violate spacing on sheet {sheet_index}."
                    )
    return ValidationResult(valid=not errors, errors=errors)
