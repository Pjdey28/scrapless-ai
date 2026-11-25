from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from typing import Any

import numpy as np
from pydantic import BaseModel

from app.schemas import AlgorithmResult, OptimizationResponse, Order

SOFTWARE_VERSION = "0.1.0"


def _jsonable(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    return value


def build_json_report(
    result: AlgorithmResult,
    response: OptimizationResponse | None = None,
    order: Order | None = None,
) -> str:
    return json.dumps(
        {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "software_version": SOFTWARE_VERSION,
            "input_order": _jsonable(order) if order else None,
            "analysis": _jsonable(result),
            "comparison": _jsonable(response.comparison) if response else None,
            "risk_prediction": _jsonable(response.risk_prediction) if response else None,
        },
        indent=2,
        allow_nan=False,
    )


def placements_csv(result: AlgorithmResult) -> str:
    buffer = io.StringIO(newline="")
    columns = [
        "sheet_index",
        "part_id",
        "instance_id",
        "original_length",
        "original_width",
        "placed_length",
        "placed_width",
        "x",
        "y",
        "rotated",
        "status",
    ]
    writer = csv.DictWriter(buffer, fieldnames=columns)
    writer.writeheader()
    rows = (item.model_dump(include=set(columns)) for item in result.placements)
    writer.writerows(
        {
            key: f"'{value}"
            if isinstance(value, str) and value.startswith(("=", "+", "-", "@", "\t", "\r"))
            else value
            for key, value in row.items()
        }
        for row in rows
    )
    return buffer.getvalue()
