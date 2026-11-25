# Packing algorithms and metric definitions

## Coordinate and spacing convention

Coordinates use the lower-left sheet origin. `x` maps to the sheet's width axis and `y` maps to its length axis. Part `length` maps along x and `width` along y. Rotation swaps those placed dimensions and is controlled by `allow_rotation`.

The configured spacing is reserved on the positive x and positive y edges of each part footprint. The reserve must fit within the stock boundary and prevents adjacent parts from violating the requested clearance. There is no separate margin unless `margin` is configured. Reported part dimensions and area remain physical dimensions; spacing is not subtracted a second time from utilization.

## First Fit Decreasing baseline

Part instances are expanded and sorted by descending physical area with deterministic dimension, part-ID, and instance-ID tie breakers. The algorithm tries permitted orientations against existing shelves in sheet order and shelf order. It chooses the feasible fit with the least vertical shelf waste, then remaining shelf width, then stable position/orientation tie breakers. When no shelf fits, it opens a shelf or sheet. This is a deterministic shelf heuristic, not a proof of optimality.

## MaxRects Best Short Side Fit

Each sheet begins with one free rectangle. For every descending-area instance, the algorithm searches all free rectangles and permitted orientations. It minimizes the shorter leftover side, then longer leftover side, sheet index, rotation, and coordinates. After placement it splits intersecting free rectangles into residual regions and removes contained rectangles. This is a heuristic; it does not guarantee a global optimum or a guillotine-cut sequence.

## Independent validation

The validator does not trust the placement search. It checks unique instance accounting, part identity, rotation permission, positive dimensions, boundaries including reserved spacing, and pairwise separation on each sheet. Invalid results expose detailed errors and are not displayed as successful KPI results.

## Metrics

- Sheet area = length × width.
- Stock area = sheets used × sheet area.
- Physical placed area = sum of placed length × placed width.
- Utilization = physical placed area ÷ stock area × 100.
- Unused area estimate = stock area − physical placed area.
- Estimated material cost = sheets used × configured cost per sheet.

Unused area is an area-based proxy, not a measure of offcut shape, reuse likelihood, or exact scrap. A zero-sheet result reports zero utilization and no cost-per-placed-part value.
