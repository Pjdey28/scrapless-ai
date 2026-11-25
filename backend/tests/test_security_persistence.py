from __future__ import annotations

import json
import uuid
from typing import Any

import httpx
import pytest
from app import main
from app.auth import AuthenticatedUser, get_current_user
from app.rate_limit import RATE_LIMITS
from fastapi.testclient import TestClient

client = TestClient(main.app)
ACCESS_TOKEN = "test-token-not-a-real-credential"
USER_ID = "c50a20f5-d797-42a8-88d5-3d4c7f736d5b"


def _auth_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("SUPABASE_URL", "https://scrapless-test.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-public-key")


def _supabase_response(
    url: str, payload: Any, status_code: int = 200
) -> httpx.Response:
    return httpx.Response(
        status_code,
        json=payload,
        request=httpx.Request("GET", url),
    )


def test_configured_backend_rejects_missing_bearer_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _auth_environment(monkeypatch)
    response = client.get("/api/v1/history")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_production_user_routes_fail_closed_without_supabase(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    assert client.get("/api/health").status_code == 503
    assert client.get("/api/v1/history").status_code == 503


def test_authentication_validates_the_bearer_with_supabase(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _auth_environment(monkeypatch)
    requested: list[str] = []

    def fake_get(url: str, **kwargs: Any) -> httpx.Response:
        requested.append(url)
        assert kwargs["headers"]["Authorization"] == f"Bearer {ACCESS_TOKEN}"
        return _supabase_response(url, {"id": USER_ID})

    monkeypatch.setattr("app.auth.httpx.get", fake_get)
    user = get_current_user(f"Bearer {ACCESS_TOKEN}")
    assert user == AuthenticatedUser(id=USER_ID, access_token=ACCESS_TOKEN)
    assert requested == ["https://scrapless-test.supabase.co/auth/v1/user"]
    assert ACCESS_TOKEN not in repr(user)


def test_invalid_supabase_token_is_not_forwarded_to_user_data(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _auth_environment(monkeypatch)
    monkeypatch.setattr(
        "app.auth.httpx.get",
        lambda url, **kwargs: _supabase_response(url, {"message": "invalid"}, 401),
    )
    response = client.get(
        "/api/v1/history",
        headers={"Authorization": f"Bearer {ACCESS_TOKEN}"},
    )
    assert response.status_code == 401


def test_authenticated_runs_and_reports_survive_memory_clear(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _auth_environment(monkeypatch)
    records: list[dict[str, Any]] = []
    queried_users: list[str] = []

    def fake_get(url: str, **kwargs: Any) -> httpx.Response:
        if url.endswith("/auth/v1/user"):
            return _supabase_response(url, {"id": USER_ID})
        params = kwargs["params"]
        queried_users.append(params.get("user_id", ""))
        user_filter = f"eq.{USER_ID}"
        assert params["user_id"] == user_filter
        run_filter = params.get("run_id")
        selected = [
            row for row in records
            if row["user_id"] == USER_ID
            and (run_filter is None or f"eq.{row['run_id']}" == run_filter)
        ]
        if params.get("select") == "payload,report_payload":
            selected = [
                {"payload": row["payload"], "report_payload": row["report_payload"]}
                for row in selected
            ]
        return _supabase_response(url, selected)

    def fake_post(url: str, **kwargs: Any) -> httpx.Response:
        assert url.endswith("/rest/v1/optimization_runs")
        assert kwargs["params"] == {"on_conflict": "user_id,run_id"}
        assert kwargs["headers"]["Prefer"] == "resolution=merge-duplicates,return=minimal"
        assert kwargs["headers"]["Authorization"] == f"Bearer {ACCESS_TOKEN}"
        records.extend(
            {**record, "created_at": "2026-11-26T00:00:00+00:00"}
            for record in kwargs["json"]
        )
        return httpx.Response(201, request=httpx.Request("POST", url))

    monkeypatch.setattr("app.auth.httpx.get", fake_get)
    monkeypatch.setattr("app.persistence.httpx.get", fake_get)
    monkeypatch.setattr("app.persistence.httpx.post", fake_post)
    main._runs.clear()

    order = main._sample_order().model_dump(mode="json")
    optimized = client.post(
        "/api/v1/optimize",
        headers={"Authorization": f"Bearer {ACCESS_TOKEN}"},
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
    assert optimized.status_code == 200
    assert len(records) == 2
    assert all(record["user_id"] == USER_ID for record in records)

    run_id = optimized.json()["optimized"]["run_id"]
    main._runs.clear()
    retrieved = client.get(
        f"/api/v1/optimize/{run_id}",
        headers={"Authorization": f"Bearer {ACCESS_TOKEN}"},
    )
    assert retrieved.status_code == 200
    assert retrieved.json()["run_id"] == run_id

    report = client.get(
        f"/api/v1/reports/{run_id}/json",
        headers={"Authorization": f"Bearer {ACCESS_TOKEN}"},
    )
    assert report.status_code == 200
    assert json.loads(report.text)["input_order"]["order_id"] == order["order_id"]
    csv_report = client.get(
        f"/api/v1/reports/{run_id}/placements.csv",
        headers={"Authorization": f"Bearer {ACCESS_TOKEN}"},
    )
    assert csv_report.status_code == 200
    assert "instance_id" in csv_report.text
    history = client.get(
        "/api/v1/history",
        headers={"Authorization": f"Bearer {ACCESS_TOKEN}"},
    )
    assert history.status_code == 200
    assert len(history.json()) == 2
    analytics = client.get(
        "/api/v1/analytics/overview",
        headers={"Authorization": f"Bearer {ACCESS_TOKEN}"},
    )
    assert analytics.status_code == 200
    assert analytics.json()["run_count"] == 2
    assert queried_users and all(value == f"eq.{USER_ID}" for value in queried_users)
    main._runs.clear()


def test_authenticated_demo_batch_persists_owner_and_simulated_dataset_marker(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _auth_environment(monkeypatch)
    persisted: list[dict[str, Any]] = []

    def fake_get(url: str, **kwargs: Any) -> httpx.Response:
        assert url.endswith("/auth/v1/user")
        return _supabase_response(url, {"id": USER_ID})

    def fake_post(url: str, **kwargs: Any) -> httpx.Response:
        assert url.endswith("/rest/v1/optimization_runs")
        assert kwargs["headers"]["Authorization"] == "Bearer " + ACCESS_TOKEN
        persisted.extend(kwargs["json"])
        return httpx.Response(201, request=httpx.Request("POST", url))

    monkeypatch.setattr("app.auth.httpx.get", fake_get)
    monkeypatch.setattr("app.persistence.httpx.post", fake_post)
    response = client.post(
        "/api/v1/demo/workspace/optimize",
        headers={"Authorization": "Bearer " + ACCESS_TOKEN},
        json={
            "dataset_id": "apex-industrial-components-v1",
            "order_ids": ["APX-DEMO-V1-001"],
        },
    )
    assert response.status_code == 200
    assert response.json()["outcomes"][0]["success"] is True
    assert len(persisted) == 2
    assert all(record["user_id"] == USER_ID for record in persisted)
    assert all(record["demo_dataset_id"] == "apex-industrial-components-v1" for record in persisted)
    assert {record["created_at"] for record in persisted} == {"2026-11-01T00:00:00+00:00"}


def test_authenticated_demo_reset_filters_by_user_and_dataset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _auth_environment(monkeypatch)

    def fake_get(url: str, **kwargs: Any) -> httpx.Response:
        return _supabase_response(url, {"id": USER_ID})

    def fake_delete(url: str, **kwargs: Any) -> httpx.Response:
        assert url.endswith("/rest/v1/optimization_runs")
        assert kwargs["params"] == {
            "user_id": f"eq.{USER_ID}",
            "demo_dataset_id": "eq.apex-industrial-components-v1",
        }
        assert kwargs["headers"]["Prefer"] == "return=representation"
        return httpx.Response(200, json=[{}, {}], request=httpx.Request("DELETE", url))

    monkeypatch.setattr("app.auth.httpx.get", fake_get)
    monkeypatch.setattr("app.persistence.httpx.delete", fake_delete)
    response = client.delete(
        "/api/v1/demo/workspace/apex-industrial-components-v1",
        headers={"Authorization": "Bearer " + ACCESS_TOKEN},
    )
    assert response.status_code == 200
    assert response.json()["optimization_records_deleted"] == 2


def test_rate_limiter_rejects_over_budget_optimization(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setitem(RATE_LIMITS, ("POST", "/api/v1/optimize"), (0, 60))
    response = client.post("/api/v1/optimize", json={})
    assert response.status_code == 429
    assert int(response.headers["retry-after"]) >= 1


def test_json_request_size_limit_is_enforced() -> None:
    response = client.post(
        "/api/v1/optimize",
        content=b"x" * (1024 * 1024 + 1),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413


def test_in_memory_demo_store_is_bounded() -> None:
    response = main.OptimizationResponse.model_validate(
        client.post(
            "/api/v1/optimize",
            json={
                "order": main._sample_order().model_dump(mode="json"),
                "sheet_config": {
                    "length": 2440,
                    "width": 1220,
                    "material": "MDF",
                },
            },
        ).json()
    )
    order = main._sample_order()
    main._runs.clear()
    for index in range(main.MAX_DEMO_RUNS // 2 + 1):
        baseline = response.baseline.model_copy(update={"run_id": str(uuid.uuid4())})
        optimized = response.optimized.model_copy(update={"run_id": str(uuid.uuid4())})
        main._remember_runs(
            response.model_copy(update={"baseline": baseline, "optimized": optimized}),
            order,
            main.datetime.now(main.timezone.utc),
        )
    assert len(main._runs) == main.MAX_DEMO_RUNS
    main._runs.clear()
