from __future__ import annotations

import os
from typing import Any

import httpx

from app.auth import AuthenticatedUser
from app.schemas import OptimizationResponse, Order

SUPABASE_TIMEOUT_SECONDS = 10.0
MAX_HISTORY_ROWS = 2_000


class SupabaseStorageError(RuntimeError):
    pass


def _request_headers(user: AuthenticatedUser, *, prefer: str | None = None) -> dict[str, str]:
    key = os.getenv("SUPABASE_ANON_KEY", "").strip()
    if not key:
        raise SupabaseStorageError("Supabase storage is not configured.")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {user.access_token}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def _runs_url() -> str:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    if not url:
        raise SupabaseStorageError("Supabase storage is not configured.")
    return f"{url}/rest/v1/optimization_runs"


def save_optimization_runs(
    response: OptimizationResponse,
    order: Order,
    user: AuthenticatedUser,
) -> None:
    records = []
    for result, counterpart in (
        (response.baseline, response.optimized),
        (response.optimized, response.baseline),
    ):
        records.append({
            "run_id": result.run_id,
            "user_id": user.id,
            "order_id": result.order_id,
            "order_name": result.order_name,
            "algorithm": result.algorithm,
            "validation_status": "valid" if result.validation.valid else "invalid",
            "metrics": result.metrics.model_dump(mode="json"),
            "sheet_config": result.sheet_config.model_dump(mode="json"),
            "payload": result.model_dump(mode="json"),
            "report_payload": {
                "input_order": order.model_dump(mode="json"),
                "comparison": response.comparison.model_dump(mode="json"),
                "risk_prediction": response.risk_prediction.model_dump(mode="json"),
                "synthetic_data_disclaimer": response.synthetic_data_disclaimer,
                "counterpart": counterpart.model_dump(mode="json"),
            },
        })
    try:
        result = httpx.post(
            _runs_url(),
            params={"on_conflict": "user_id,run_id"},
            headers=_request_headers(
                user, prefer="resolution=merge-duplicates,return=minimal"
            ),
            json=records,
            timeout=SUPABASE_TIMEOUT_SECONDS,
        )
    except httpx.RequestError as exc:
        raise SupabaseStorageError("Supabase storage is temporarily unavailable.") from exc
    if not result.is_success:
        raise SupabaseStorageError("Supabase rejected the optimization result.")


def get_owned_run(run_id: str, user: AuthenticatedUser) -> dict[str, Any] | None:
    try:
        response = httpx.get(
            _runs_url(),
            params={
                "run_id": f"eq.{run_id}",
                "user_id": f"eq.{user.id}",
                "select": "payload,report_payload",
                "limit": "1",
            },
            headers=_request_headers(user),
            timeout=SUPABASE_TIMEOUT_SECONDS,
        )
    except httpx.RequestError as exc:
        raise SupabaseStorageError("Supabase storage is temporarily unavailable.") from exc
    if not response.is_success:
        raise SupabaseStorageError("Supabase could not retrieve the optimization result.")
    records = response.json()
    if not isinstance(records, list) or not records:
        return None
    record = records[0]
    return record if isinstance(record, dict) else None


def list_owned_runs(user: AuthenticatedUser) -> list[dict[str, Any]]:
    try:
        response = httpx.get(
            _runs_url(),
            params={
                "user_id": f"eq.{user.id}",
                "select": "created_at,order_name,order_id,algorithm,metrics,sheet_config,payload",
                "order": "created_at.desc",
                "limit": str(MAX_HISTORY_ROWS),
            },
            headers=_request_headers(user),
            timeout=SUPABASE_TIMEOUT_SECONDS,
        )
    except httpx.RequestError as exc:
        raise SupabaseStorageError("Supabase storage is temporarily unavailable.") from exc
    if not response.is_success:
        raise SupabaseStorageError("Supabase could not retrieve optimization history.")
    records = response.json()
    if not isinstance(records, list):
        raise SupabaseStorageError("Supabase returned an invalid history response.")
    return [record for record in records if isinstance(record, dict)]
