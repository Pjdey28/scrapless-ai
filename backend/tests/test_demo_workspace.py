from __future__ import annotations

import json
from collections.abc import Iterator

import pytest
from app import main
from app.demo_data import DEMO_LAYOUT_IMAGE_PATH, load_demo_dataset
from app.schemas import OptimizationInput
from app.vision.detector import detect_rectangles
from fastapi.testclient import TestClient
from scripts.generate_demo_assets import DATASET_ID, build_dataset

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def clear_run_store() -> Iterator[None]:
    main._runs.clear()
    main._demo_run_dataset.clear()
    yield
    main._runs.clear()
    main._demo_run_dataset.clear()


def _clear_demo_runs() -> None:
    for run_id, dataset_id in list(main._demo_run_dataset.items()):
        if dataset_id == DATASET_ID:
            main._runs.pop(run_id, None)
            main._demo_run_dataset.pop(run_id, None)


def test_generated_dataset_is_deterministic_and_matches_checked_in_data() -> None:
    generated = build_dataset()
    checked_in = json.loads(
        (DEMO_LAYOUT_IMAGE_PATH.parent / "demo_orders.json").read_text(encoding="utf-8")
    )
    assert generated == checked_in


def test_dataset_has_valid_orders_materials_and_workload_profiles() -> None:
    dataset = load_demo_dataset()
    assert len(dataset.records) == 25
    assert {record.sheet_config.material for record in dataset.records} == {
        "Mild steel",
        "Aluminium",
        "Stainless steel",
    }
    assert {record.metadata.workload_profile for record in dataset.records} == {
        "small-batch",
        "mixed-production",
        "high-volume",
    }
    for record in dataset.records:
        OptimizationInput(order=record.order, sheet_config=record.sheet_config)
        assert sum(part.quantity for part in record.order.parts) <= 500
        assert all(part.material == record.sheet_config.material for part in record.order.parts)
        assert record.metadata.timestamp_is_simulated is True


def test_demo_workspace_api_runs_both_real_algorithms_and_analytics_uses_saved_results() -> None:
    dataset = load_demo_dataset()
    order_ids = [record.order.order_id for record in dataset.records[:3]]
    response = client.post(
        "/api/v1/demo/workspace/optimize",
        json={"dataset_id": DATASET_ID, "order_ids": order_ids},
    )
    assert response.status_code == 200
    outcomes = response.json()["outcomes"]
    assert len(outcomes) == len(order_ids)
    assert all(outcome["success"] for outcome in outcomes)
    assert all(outcome["baseline_valid"] and outcome["optimized_valid"] for outcome in outcomes)
    assert all(len(outcome["run_ids"]) == 2 for outcome in outcomes)

    history = client.get("/api/v1/history")
    demo_entries = [entry for entry in history.json() if entry.get("demo_dataset_id") == DATASET_ID]
    assert len(demo_entries) == len(order_ids) * 2
    assert {
        entry["result"]["algorithm"] for entry in demo_entries
    } == {"first_fit_decreasing", "maxrects_bssf"}
    trends = client.get("/api/v1/analytics/trends").json()["data"]
    assert len([row for row in trends if row["demo_dataset_id"] == DATASET_ID]) == len(order_ids) * 2
    assert all(row["timestamp_is_simulated"] for row in trends if row["demo_dataset_id"] == DATASET_ID)
    overview = client.get("/api/v1/analytics/overview").json()
    assert overview["run_count"] == len(order_ids) * 2
    assert overview["demo_result_count"] == len(order_ids) * 2
    _clear_demo_runs()


def test_demo_workspace_batch_rejects_non_dataset_orders_and_duplicate_ids() -> None:
    unknown = client.post(
        "/api/v1/demo/workspace/optimize",
        json={"dataset_id": DATASET_ID, "order_ids": ["REAL-ORDER"]},
    )
    assert unknown.status_code == 400
    duplicate = client.post(
        "/api/v1/demo/workspace/optimize",
        json={"dataset_id": DATASET_ID, "order_ids": ["APX-DEMO-V1-001"] * 2},
    )
    assert duplicate.status_code == 422


def test_demo_reset_removes_only_marked_runs() -> None:
    _clear_demo_runs()
    record = load_demo_dataset().records[0]
    normal = client.post(
        "/api/v1/optimize",
        json={
            "order": record.order.model_dump(mode="json"),
            "sheet_config": record.sheet_config.model_dump(mode="json"),
        },
    )
    assert normal.status_code == 200
    demo = client.post(
        "/api/v1/demo/workspace/optimize",
        json={"dataset_id": DATASET_ID, "order_ids": [record.order.order_id]},
    )
    assert demo.status_code == 200
    result = client.delete(f"/api/v1/demo/workspace/{DATASET_ID}")
    assert result.status_code == 200
    assert result.json()["optimization_records_deleted"] == 2
    history = client.get("/api/v1/history").json()
    assert len(history) == 2
    assert all(entry["result"]["order_id"] == record.order.order_id for entry in history)
    assert all(entry["demo_dataset_id"] is None for entry in history)
    _clear_demo_runs()


def test_demo_reset_allows_browser_cors_preflight() -> None:
    response = client.options(
        f"/api/v1/demo/workspace/{DATASET_ID}",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "DELETE",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "DELETE" in response.headers["access-control-allow-methods"]


def test_sample_vision_image_is_processed_by_opencv() -> None:
    result = detect_rectangles(DEMO_LAYOUT_IMAGE_PATH.read_bytes())
    assert result["candidate_count"] >= 8
    assert result["units"] == "pixels"
    assert len(result["annotated_image_base64"]) > 1000
