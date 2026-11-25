import io

from app.main import app
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

client = TestClient(app)


def test_health_and_demo_order() -> None:
    assert client.get("/api/health").json()["status"] == "ok"
    sample = client.get("/api/v1/demo/sample-order")
    assert sample.status_code == 200
    assert sample.json()["parts"]


def test_optimization_round_trip_and_exports() -> None:
    order = client.get("/api/v1/demo/sample-order").json()
    response = client.post(
        "/api/v1/optimize",
        json={
            "order": order,
            "sheet_config": {
                "length": 2440,
                "width": 1220,
                "material": "MDF",
                "cost_per_sheet": 45,
            },
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert result["baseline"]["validation"]["valid"]
    assert result["optimized"]["validation"]["valid"]
    assert result["risk_prediction"]["data_disclaimer"]
    run_id = result["optimized"]["run_id"]
    assert client.get(f"/api/v1/optimize/{run_id}").status_code == 200
    report = client.get(f"/api/v1/reports/{run_id}/json")
    assert report.headers["content-type"].startswith("application/json")
    assert '"input_order"' in report.text
    assert '"risk_prediction"' in report.text
    assert "instance_id" in client.get(f"/api/v1/reports/{run_id}/placements.csv").text
    assert len(client.get("/api/v1/history").json()) >= 2
    assert len(client.get("/api/v1/analytics/trends").json()["data"]) >= 2


def test_invalid_optimization_payload_returns_validation_error() -> None:
    response = client.post("/api/v1/optimize", json={"order": {}, "sheet_config": {}})
    assert response.status_code == 422


def test_unknown_run_is_not_found() -> None:
    assert client.get("/api/v1/optimize/missing-run").status_code == 404


def test_invalid_csv_rows_are_reported_not_dropped() -> None:
    response = client.post(
        "/api/v1/orders/validate",
        files={
            "file": (
                "parts.csv",
                b"part_id,length,width,quantity\nA,20,10,2\nB,-2,10,1\n",
                "text/csv",
            )
        },
    )
    assert response.status_code == 200
    assert response.json()["accepted_rows"] == 1
    assert response.json()["valid"] is False
    assert response.json()["errors"][0]["row"] == 3


def test_risk_endpoint_returns_disclosed_synthetic_assessment() -> None:
    order = client.get("/api/v1/demo/sample-order").json()
    response = client.post(
        "/api/v1/ml/predict-risk",
        json={
            "order": order,
            "sheet_config": {"length": 2440, "width": 1220, "material": "MDF"},
        },
    )
    assert response.status_code == 200
    assert response.json()["risk_class"] in {"high", "lower"}
    assert "synthetic" in response.json()["data_disclaimer"].lower()


def test_vision_endpoint_processes_image_and_rejects_bad_image() -> None:
    image = Image.new("RGB", (200, 150), "white")
    ImageDraw.Draw(image).rectangle((20, 20, 100, 100), fill="black")
    content = io.BytesIO()
    image.save(content, format="PNG")
    response = client.post(
        "/api/v1/vision/detect",
        files={"file": ("pieces.png", content.getvalue(), "image/png")},
    )
    assert response.status_code == 200
    assert response.json()["candidate_count"] == 1
    assert response.json()["annotated_image_base64"]
    invalid = client.post(
        "/api/v1/vision/detect",
        files={"file": ("invalid.png", b"no image", "image/png")},
    )
    assert invalid.status_code == 400


def test_post_body_size_limit_is_enforced_with_cors_headers() -> None:
    response = client.post(
        "/api/v1/orders/validate",
        content=b"x" * (2 * 1024 * 1024 + 1),
        headers={"Origin": "http://localhost:3000"},
    )
    assert response.status_code == 413
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
