from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter
from typing import Literal

from app.metrics import calculate_metrics
from app.optimization.validation import validate_layout
from app.schemas import (
    AlgorithmResult,
    Order,
    Part,
    Placement,
    SheetConfig,
    new_run_id,
    validate_material_compatibility,
)


@dataclass(frozen=True)
class PartInstance:
    part: Part
    instance_id: str

    @property
    def area(self) -> float:
        return self.part.length * self.part.width


@dataclass
class Shelf:
    y: float
    height: float
    used_width: float = 0.0


def _instances(order: Order) -> list[PartInstance]:
    result: list[PartInstance] = []
    for part in order.parts:
        result.extend(
            PartInstance(part, f"{part.part_id}-{number:05d}")
            for number in range(1, part.quantity + 1)
        )
    return sorted(
        result,
        key=lambda item: (
            -item.area,
            -max(item.part.length, item.part.width),
            item.part.part_id,
            item.instance_id,
        ),
    )


def _orientations(instance: PartInstance, sheet: SheetConfig) -> list[tuple[float, float, bool]]:
    options = [(instance.part.length, instance.part.width, False)]
    if sheet.allow_rotation and instance.part.length != instance.part.width:
        options.append((instance.part.width, instance.part.length, True))
    return options


def _footprint(length: float, width: float, sheet: SheetConfig) -> tuple[float, float]:
    return length + sheet.spacing, width + sheet.spacing


def _result(
    order: Order,
    sheet: SheetConfig,
    algorithm: Literal["first_fit_decreasing", "maxrects_bssf"],
    started: float,
    placements: list[Placement],
    unplaced: list[PartInstance],
    config: dict[str, str | int | float | bool],
) -> AlgorithmResult:
    runtime_ms = (perf_counter() - started) * 1000
    unplaced_records = [
        {"part_id": item.part.part_id, "instance_id": item.instance_id} for item in unplaced
    ]
    validation = validate_layout(order, sheet, placements, unplaced_records)
    metrics = calculate_metrics(
        order,
        sheet,
        placements,
        len({p.sheet_index for p in placements}),
        runtime_ms,
        validation.valid,
    )
    return AlgorithmResult(
        run_id=new_run_id(),
        algorithm=algorithm,
        order_id=order.order_id,
        order_name=order.name,
        sheet_config=sheet,
        placements=placements,
        unplaced_instances=unplaced_records,
        runtime_ms=runtime_ms,
        algorithm_config=config,
        validation=validation,
        metrics=metrics,
    )


def first_fit_decreasing(order: Order, sheet: SheetConfig) -> AlgorithmResult:
    """Deterministic area-descending shelf packing; shelves advance from the lower-left."""
    validate_material_compatibility(order, sheet)
    started = perf_counter()
    usable_width = sheet.width - 2 * sheet.margin
    usable_height = sheet.length - 2 * sheet.margin
    shelves: list[list[Shelf]] = []
    placements: list[Placement] = []
    unplaced: list[PartInstance] = []
    instances = _instances(order)

    for instance in instances:
        candidates: list[
            tuple[tuple[float, float, int, float, int], int, int, float, float, bool, float, float]
        ] = []
        for sheet_idx, sheet_shelves in enumerate(shelves):
            for shelf_idx, shelf_row in enumerate(sheet_shelves):
                for length, width, rotated in _orientations(instance, sheet):
                    fw, fh = _footprint(length, width, sheet)
                    if fh <= shelf_row.height and shelf_row.used_width + fw <= usable_width:
                        score = (
                            shelf_row.height - fh,
                            usable_width - shelf_row.used_width - fw,
                            sheet_idx,
                            shelf_row.y,
                            int(rotated),
                        )
                        candidates.append(
                            (score, sheet_idx, shelf_idx, length, width, rotated, fw, fh)
                        )
        if candidates:
            _, sheet_idx, shelf_idx, length, width, rotated, fw, _ = min(
                candidates, key=lambda item: item[0]
            )
            shelf_row = shelves[sheet_idx][shelf_idx]
            x = sheet.margin + shelf_row.used_width
            y = sheet.margin + shelf_row.y
            shelf_row.used_width += fw
        else:
            options = []
            for length, width, rotated in _orientations(instance, sheet):
                fw, fh = _footprint(length, width, sheet)
                if fw <= usable_width and fh <= usable_height:
                    options.append(((fh, fw, int(rotated)), length, width, rotated, fw, fh))
            if not options:
                unplaced.append(instance)
                continue
            available_sheet = None
            for sheet_idx, sheet_shelves in enumerate(shelves):
                next_y = sheet_shelves[-1].y + sheet_shelves[-1].height if sheet_shelves else 0
                feasible = [(opt, next_y) for opt in options if next_y + opt[5] <= usable_height]
                if feasible:
                    available_sheet = (
                        sheet_idx,
                        min(feasible, key=lambda item: item[0])[0],
                        next_y,
                    )
                    break
            if available_sheet is None:
                if len(shelves) >= sheet.max_sheets:
                    unplaced.append(instance)
                    continue
                shelves.append([])
                sheet_idx = len(shelves) - 1
                next_y = 0.0
                selected = min(options, key=lambda item: item[0])
            else:
                sheet_idx, selected, next_y = available_sheet
            _, length, width, rotated, fw, fh = selected
            shelf_idx = len(shelves[sheet_idx])
            shelves[sheet_idx].append(Shelf(next_y, fh, fw))
            x = sheet.margin
            y = sheet.margin + next_y

        placements.append(
            Placement(
                sheet_index=sheet_idx,
                part_id=instance.part.part_id,
                instance_id=instance.instance_id,
                original_length=instance.part.length,
                original_width=instance.part.width,
                placed_length=length,
                placed_width=width,
                x=x,
                y=y,
                rotated=rotated,
            )
        )

    return _result(
        order,
        sheet,
        "first_fit_decreasing",
        started,
        placements,
        unplaced,
        {
            "placement_strategy": "area-descending shelves from lower-left",
            "spacing_convention": "reserve spacing on positive x and y edges",
        },
    )


@dataclass
class FreeRect:
    x: float
    y: float
    width: float
    height: float


def _intersects(a: FreeRect, b: FreeRect) -> bool:
    return not (
        b.x >= a.x + a.width
        or b.x + b.width <= a.x
        or b.y >= a.y + a.height
        or b.y + b.height <= a.y
    )


def _split_free_rectangles(free_rects: list[FreeRect], used: FreeRect) -> list[FreeRect]:
    split: list[FreeRect] = []
    for free in free_rects:
        if not _intersects(free, used):
            split.append(free)
            continue
        if used.x < free.x + free.width and used.x + used.width > free.x:
            if used.y > free.y and used.y < free.y + free.height:
                split.append(FreeRect(free.x, free.y, free.width, used.y - free.y))
            if used.y + used.height < free.y + free.height:
                split.append(
                    FreeRect(
                        free.x,
                        used.y + used.height,
                        free.width,
                        free.y + free.height - (used.y + used.height),
                    )
                )
        if used.y < free.y + free.height and used.y + used.height > free.y:
            if used.x > free.x and used.x < free.x + free.width:
                split.append(FreeRect(free.x, free.y, used.x - free.x, free.height))
            if used.x + used.width < free.x + free.width:
                split.append(
                    FreeRect(
                        used.x + used.width,
                        free.y,
                        free.x + free.width - (used.x + used.width),
                        free.height,
                    )
                )
    split = [r for r in split if r.width > 0 and r.height > 0]
    pruned: list[FreeRect] = []
    for i, rect in enumerate(split):
        if any(
            i != j
            and rect.x >= other.x
            and rect.y >= other.y
            and rect.x + rect.width <= other.x + other.width
            and rect.y + rect.height <= other.y + other.height
            for j, other in enumerate(split)
        ):
            continue
        pruned.append(rect)
    return pruned


def maxrects_bssf(order: Order, sheet: SheetConfig) -> AlgorithmResult:
    """MaxRects Best Short Side Fit heuristic; it does not guarantee global optimality."""
    validate_material_compatibility(order, sheet)
    started = perf_counter()
    usable_width = sheet.width - 2 * sheet.margin
    usable_height = sheet.length - 2 * sheet.margin
    free_by_sheet: list[list[FreeRect]] = []
    placements: list[Placement] = []
    unplaced: list[PartInstance] = []

    for instance in _instances(order):
        candidates: list[
            tuple[
                tuple[float, float, int, int, float, float],
                int,
                int,
                float,
                float,
                bool,
                float,
                float,
                float,
                float,
            ]
        ] = []
        for sheet_idx, free_rects in enumerate(free_by_sheet):
            for rect_idx, rect in enumerate(free_rects):
                for length, width, rotated in _orientations(instance, sheet):
                    fw, fh = _footprint(length, width, sheet)
                    if fw <= rect.width and fh <= rect.height:
                        leftover_w, leftover_h = rect.width - fw, rect.height - fh
                        score = (
                            min(leftover_w, leftover_h),
                            max(leftover_w, leftover_h),
                            sheet_idx,
                            int(rotated),
                            rect.y,
                            rect.x,
                        )
                        candidates.append(
                            (
                                score,
                                sheet_idx,
                                rect_idx,
                                length,
                                width,
                                rotated,
                                fw,
                                fh,
                                rect.x,
                                rect.y,
                            )
                        )
        if not candidates and len(free_by_sheet) < sheet.max_sheets:
            free_by_sheet.append(
                [FreeRect(sheet.margin, sheet.margin, usable_width, usable_height)]
            )
            sheet_idx = len(free_by_sheet) - 1
            for rect_idx, rect in enumerate(free_by_sheet[sheet_idx]):
                for length, width, rotated in _orientations(instance, sheet):
                    fw, fh = _footprint(length, width, sheet)
                    if fw <= rect.width and fh <= rect.height:
                        leftover_w, leftover_h = rect.width - fw, rect.height - fh
                        score = (
                            min(leftover_w, leftover_h),
                            max(leftover_w, leftover_h),
                            sheet_idx,
                            int(rotated),
                            rect.y,
                            rect.x,
                        )
                        candidates.append(
                            (
                                score,
                                sheet_idx,
                                rect_idx,
                                length,
                                width,
                                rotated,
                                fw,
                                fh,
                                rect.x,
                                rect.y,
                            )
                        )
        if not candidates:
            unplaced.append(instance)
            continue
        _, sheet_idx, _, length, width, rotated, fw, fh, x, y = min(
            candidates, key=lambda item: item[0]
        )
        free = free_by_sheet[sheet_idx]
        free_by_sheet[sheet_idx] = _split_free_rectangles(free, FreeRect(x, y, fw, fh))
        placements.append(
            Placement(
                sheet_index=sheet_idx,
                part_id=instance.part.part_id,
                instance_id=instance.instance_id,
                original_length=instance.part.length,
                original_width=instance.part.width,
                placed_length=length,
                placed_width=width,
                x=x,
                y=y,
                rotated=rotated,
            )
        )
    return _result(
        order,
        sheet,
        "maxrects_bssf",
        started,
        placements,
        unplaced,
        {
            "heuristic": "Best Short Side Fit",
            "spacing_convention": "reserve spacing on positive x and y edges",
        },
    )
