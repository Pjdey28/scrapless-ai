from __future__ import annotations

from functools import lru_cache

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split

from app.schemas import Order, SheetConfig

MODEL_VERSION = "synthetic-rf-1.0"
FEATURE_NAMES = (
    "part_count",
    "requested_area_ratio",
    "distinct_dimension_count",
    "mean_part_area_ratio",
    "part_area_std_ratio",
    "smallest_part_ratio",
    "largest_part_ratio",
    "mean_aspect_ratio",
    "sheet_aspect_ratio",
)
DISCLAIMER = (
    "Experimental estimate trained and evaluated only on reproducible synthetic data. "
    "The score is not a calibrated real-world probability and is not industry-validated."
)


def _features(order: Order, sheet: SheetConfig) -> np.ndarray:
    areas: list[float] = []
    ratios: list[float] = []
    instances: list[tuple[float, float]] = []
    for part in order.parts:
        for _ in range(part.quantity):
            areas.append(part.length * part.width)
            ratios.append(max(part.length, part.width) / min(part.length, part.width))
            instances.append((part.length, part.width))
    sheet_area = sheet.length * sheet.width
    requested_area_ratio = sum(areas) / sheet_area
    normalized_areas = np.asarray(areas, dtype=float) / sheet_area
    dimensions = {(length, width) for length, width in instances}
    return np.asarray(
        [
            [
                len(instances),
                requested_area_ratio,
                len(dimensions),
                float(np.mean(normalized_areas)),
                float(np.std(normalized_areas)),
                float(np.min(normalized_areas)),
                float(np.max(normalized_areas)),
                float(np.mean(ratios)),
                sheet.length / sheet.width,
            ]
        ],
        dtype=float,
    )


@lru_cache(maxsize=1)
def _trained_model() -> tuple[RandomForestClassifier, dict[str, object]]:
    rng = np.random.default_rng(42)
    sample_count = 1_200
    counts = rng.integers(1, 150, sample_count)
    area_ratio = rng.uniform(0.08, 1.8, sample_count)
    distinct = rng.integers(1, 30, sample_count)
    mean_area = area_ratio / counts
    std_area = mean_area * rng.uniform(0.05, 2.0, sample_count)
    min_area = mean_area * rng.uniform(0.05, 0.9, sample_count)
    max_area = mean_area * rng.uniform(1.0, 4.0, sample_count)
    mean_aspect = rng.uniform(1, 8, sample_count)
    sheet_aspect = rng.uniform(1, 3, sample_count)
    X = np.column_stack(
        (
            counts,
            area_ratio,
            distinct,
            mean_area,
            std_area,
            min_area,
            max_area,
            mean_aspect,
            sheet_aspect,
        )
    )
    # Synthetic labelling rule: risk rises with poor area fit, shape variation, and extreme aspect ratios.
    risk_score = (
        0.45 * np.abs(area_ratio - np.round(area_ratio))
        + 0.25 * np.minimum(std_area * 40, 1)
        + 0.2 * np.minimum((mean_aspect - 1) / 7, 1)
        + 0.1 * (distinct / 30)
    )
    y = (risk_score >= np.quantile(risk_score, 0.65)).astype(int)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )
    model = RandomForestClassifier(
        n_estimators=160, max_depth=10, random_state=42, class_weight="balanced"
    )
    model.fit(X_train, y_train)
    predicted = model.predict(X_test)
    evaluation: dict[str, object] = {
        "training_rows": int(len(y_train)),
        "testing_rows": int(len(y_test)),
        "accuracy": float(accuracy_score(y_test, predicted)),
        "precision": float(precision_score(y_test, predicted, zero_division=0)),
        "recall": float(recall_score(y_test, predicted, zero_division=0)),
        "f1": float(f1_score(y_test, predicted, zero_division=0)),
        "confusion_matrix": confusion_matrix(y_test, predicted).tolist(),
        "feature_importance": [
            {"feature": name, "importance": float(value)}
            for name, value in sorted(
                zip(FEATURE_NAMES, model.feature_importances_), key=lambda pair: -pair[1]
            )
        ],
        "model_version": MODEL_VERSION,
        "data_disclaimer": DISCLAIMER,
    }
    return model, evaluation


def predict_risk(order: Order, sheet: SheetConfig) -> dict[str, object]:
    model, evaluation = _trained_model()
    features = _features(order, sheet)
    predicted = int(model.predict(features)[0])
    score = float(model.predict_proba(features)[0][predicted])
    top_feature = evaluation["feature_importance"][0]["feature"]  # type: ignore[index]
    return {
        "risk_class": "high" if predicted else "lower",
        "model_score": score,
        "feature_importance": evaluation["feature_importance"],
        "explanation": f"The synthetic model's strongest general signal was {top_feature}; review this order alongside the validated packing results.",
        "model_version": MODEL_VERSION,
        "data_disclaimer": DISCLAIMER,
        "features": dict(zip(FEATURE_NAMES, features[0].tolist())),
    }


def model_evaluation() -> dict[str, object]:
    return _trained_model()[1]
