from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas import Order, SheetConfig

DEMO_DATASET_PATH = Path(__file__).resolve().parents[1] / "data" / "demo_orders.json"
DEMO_LAYOUT_IMAGE_PATH = Path(__file__).resolve().parents[1] / "data" / "demo_cutting_layout.png"


class DemoOrderMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_id: str
    customer_name: str = Field(min_length=1, max_length=200)
    created_at: date
    due_date: date
    priority: Literal["urgent", "high", "normal", "low"]
    status: Literal["in production", "ready", "queued"]
    workload_profile: Literal["small-batch", "mixed-production", "high-volume"]
    rotation_sensitive: bool
    timestamp_is_simulated: Literal[True]


class DemoOrderRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    order: Order
    sheet_config: SheetConfig
    metadata: DemoOrderMetadata


class DemoDataset(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_id: Literal["apex-industrial-components-v1"]
    company_name: str
    description: str
    records: list[DemoOrderRecord] = Field(min_length=1, max_length=25)


def load_demo_dataset() -> DemoDataset:
    try:
        raw = json.loads(DEMO_DATASET_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError("The checked-in demo workspace dataset is unavailable or invalid.") from exc
    dataset = DemoDataset.model_validate(raw)
    if any(record.metadata.dataset_id != dataset.dataset_id for record in dataset.records):
        raise ValueError("Demo order dataset markers do not match the dataset identifier.")
    return dataset
