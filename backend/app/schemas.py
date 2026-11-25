from __future__ import annotations

from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_ORDER_PART_TYPES = 250
MAX_ORDER_PART_INSTANCES = 500


class Part(BaseModel):
    model_config = ConfigDict(extra="forbid")

    part_id: str = Field(min_length=1, max_length=100)
    length: float = Field(gt=0, le=100_000, allow_inf_nan=False)
    width: float = Field(gt=0, le=100_000, allow_inf_nan=False)
    quantity: int = Field(gt=0, le=MAX_ORDER_PART_INSTANCES)
    priority: int = Field(default=0, ge=0, le=1_000_000)
    material: str | None = Field(
        default=None,
        max_length=100,
        description="When omitted, the selected stock-sheet material is assumed.",
    )
    description: str | None = Field(default=None, max_length=500)

    @field_validator("material", mode="before")
    @classmethod
    def normalize_material(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value


class Order(BaseModel):
    model_config = ConfigDict(extra="forbid")

    order_id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    parts: list[Part] = Field(min_length=1, max_length=MAX_ORDER_PART_TYPES)

    @model_validator(mode="after")
    def unique_part_ids(self) -> Order:
        identifiers = [part.part_id for part in self.parts]
        if len(identifiers) != len(set(identifiers)):
            raise ValueError("part_id values must be unique within an order.")
        if sum(part.quantity for part in self.parts) > MAX_ORDER_PART_INSTANCES:
            raise ValueError(
                f"An order may contain at most {MAX_ORDER_PART_INSTANCES:,} part instances."
            )
        return self


class SheetConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    length: float = Field(gt=0, le=100_000, allow_inf_nan=False)
    width: float = Field(gt=0, le=100_000, allow_inf_nan=False)
    material: str = Field(min_length=1, max_length=100)
    cost_per_sheet: float = Field(default=0, ge=0, le=1_000_000_000, allow_inf_nan=False)
    currency: str = Field(default="USD", min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    spacing: float = Field(default=0, ge=0, le=100_000, allow_inf_nan=False)
    allow_rotation: bool = True
    max_sheets: int = Field(default=100, ge=1, le=200)
    margin: float = Field(default=0, ge=0, le=100_000, allow_inf_nan=False)

    @field_validator("material")
    @classmethod
    def normalize_material(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Stock-sheet material is required.")
        return normalized

    @model_validator(mode="after")
    def margin_fits_sheet(self) -> SheetConfig:
        if self.margin * 2 >= min(self.length, self.width):
            raise ValueError("Sheet margin must be less than half of each sheet dimension.")
        return self


class Placement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sheet_index: int = Field(ge=0)
    part_id: str
    instance_id: str
    original_length: float = Field(gt=0, allow_inf_nan=False)
    original_width: float = Field(gt=0, allow_inf_nan=False)
    placed_length: float = Field(gt=0, allow_inf_nan=False)
    placed_width: float = Field(gt=0, allow_inf_nan=False)
    x: float = Field(ge=0, allow_inf_nan=False)
    y: float = Field(ge=0, allow_inf_nan=False)
    rotated: bool
    status: Literal["placed"] = "placed"


class ValidationResult(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)


class Metrics(BaseModel):
    total_requested_parts: int
    placed_parts: int
    unplaced_parts: int
    sheets_used: int
    stock_area: float
    placed_area: float
    unused_area: float
    utilization_percent: float
    unused_area_percent: float
    material_cost: float
    estimated_cost_per_placed_part: float | None
    runtime_ms: float
    validation_status: Literal["valid", "invalid"]


class AlgorithmResult(BaseModel):
    run_id: str
    algorithm: Literal["first_fit_decreasing", "maxrects_bssf"]
    order_id: str
    order_name: str
    sheet_config: SheetConfig
    placements: list[Placement]
    unplaced_instances: list[dict[str, str]]
    runtime_ms: float
    algorithm_config: dict[str, str | int | float | bool]
    validation: ValidationResult
    metrics: Metrics


class Comparison(BaseModel):
    sheet_count_difference: int
    utilization_improvement_percentage_points: float | None
    estimated_unused_area_reduction: float | None
    estimated_material_cost_difference: float | None
    unplaced_part_difference: int
    runtime_difference_ms: float
    improvements_valid: bool


class FeatureImportance(BaseModel):
    feature: str
    importance: float = Field(ge=0, le=1)


class RiskPrediction(BaseModel):
    risk_class: Literal["high", "lower"]
    model_score: float = Field(ge=0, le=1)
    feature_importance: list[FeatureImportance]
    explanation: str
    model_version: str
    data_disclaimer: str
    features: dict[str, float]


class ModelEvaluation(BaseModel):
    training_rows: int = Field(ge=1)
    testing_rows: int = Field(ge=1)
    accuracy: float = Field(ge=0, le=1)
    precision: float = Field(ge=0, le=1)
    recall: float = Field(ge=0, le=1)
    f1: float = Field(ge=0, le=1)
    confusion_matrix: list[list[int]]
    feature_importance: list[FeatureImportance]
    model_version: str
    data_disclaimer: str


class OptimizationResponse(BaseModel):
    baseline: AlgorithmResult
    optimized: AlgorithmResult
    comparison: Comparison
    risk_prediction: RiskPrediction
    synthetic_data_disclaimer: str


class OptimizationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    order: Order
    sheet_config: SheetConfig

    @model_validator(mode="after")
    def compatible_materials(self) -> OptimizationInput:
        validate_material_compatibility(self.order, self.sheet_config)
        return self


def validate_material_compatibility(order: Order, sheet: SheetConfig) -> None:
    sheet_material = sheet.material.casefold()
    incompatible = sorted(
        {
            part.material
            for part in order.parts
            if part.material is not None and part.material.casefold() != sheet_material
        },
        key=str.casefold,
    )
    if incompatible:
        materials = ", ".join(incompatible)
        raise ValueError(
            f"Part material(s) {materials} do not match selected stock-sheet material "
            f"'{sheet.material}'. Use one material per optimization."
        )


class DemoWorkspaceOptimizeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_id: Literal["apex-industrial-components-v1"]
    order_ids: list[str] = Field(min_length=1, max_length=5)

    @model_validator(mode="after")
    def unique_order_ids(self) -> DemoWorkspaceOptimizeRequest:
        if len(set(self.order_ids)) != len(self.order_ids):
            raise ValueError("Demo optimization batches cannot contain duplicate order IDs.")
        return self


class DemoOptimizationOutcome(BaseModel):
    order_id: str
    success: bool
    run_ids: list[str] = Field(default_factory=list)
    baseline_valid: bool | None = None
    optimized_valid: bool | None = None
    detail: str | None = None


def new_run_id() -> str:
    return str(uuid4())
