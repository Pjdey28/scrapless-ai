from __future__ import annotations

import logging
import os
import threading
from collections import Counter, OrderedDict
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, Response
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from app.auth import (
    AuthenticatedUser,
    get_current_user,
    require_production_configuration,
    supabase_is_configured,
)
from app.csv_import import MAX_UPLOAD_BYTES, parse_parts_csv
from app.demo_data import DEMO_LAYOUT_IMAGE_PATH, load_demo_dataset
from app.ml.risk import model_evaluation, predict_risk
from app.optimization.packing import first_fit_decreasing, maxrects_bssf
from app.persistence import (
    SupabaseStorageError,
    delete_owned_demo_runs,
    get_owned_run,
    list_owned_runs,
    save_optimization_runs,
)
from app.rate_limit import RateLimitMiddleware
from app.reports import build_json_report, placements_csv
from app.schemas import (
    MAX_ORDER_PART_INSTANCES,
    AlgorithmResult,
    Comparison,
    DemoOptimizationOutcome,
    DemoWorkspaceOptimizeRequest,
    ModelEvaluation,
    OptimizationInput,
    OptimizationResponse,
    Order,
    Part,
    RiskPrediction,
)
from app.vision.detector import MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, detect_rectangles

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("scrapless")

@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    require_production_configuration()
    yield


app = FastAPI(
    title="ScrapLess AI API",
    version="0.1.0",
    description="Rectangular sheet-cutting analysis API.",
    lifespan=lifespan,
)
origins = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").split(",")
    if origin.strip()
]
MAX_DEMO_RUNS = 200
_runs: OrderedDict[str, tuple[OptimizationResponse, Order, datetime]] = OrderedDict()
_demo_run_dataset: dict[str, str] = {}
_optimization_capacity = threading.BoundedSemaphore(value=2)
_vision_capacity = threading.BoundedSemaphore(value=2)
SYNTHETIC_DATA_DISCLAIMER = "Scrap-risk estimates use a reproducible synthetic training dataset and are not industry-validated."
MAX_DEMO_BATCH_INSTANCES = 500


class RequestSizeLimitMiddleware:
    def __init__(self, application: Any) -> None:
        self.application = application

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http" or scope["method"] != "POST":
            await self.application(scope, receive, send)
            return

        path = scope["path"]
        if path.endswith("/vision/detect"):
            limit = MAX_IMAGE_BYTES + 64 * 1024
        elif path.endswith("/orders/validate"):
            limit = MAX_UPLOAD_BYTES + 64 * 1024
        else:
            limit = 1024 * 1024
        content_length = next(
            (
                value
                for name, value in scope.get("headers", [])
                if name.lower() == b"content-length"
            ),
            None,
        )
        if content_length:
            try:
                if int(content_length) > limit:
                    await self._reject(send)
                    return
            except ValueError:
                await self._reject(send, 400, b"Invalid Content-Length header.")
                return

        body = bytearray()
        more_body = True
        while more_body:
            message = await receive()
            if message["type"] != "http.request":
                continue
            body.extend(message.get("body", b""))
            if len(body) > limit:
                await self._reject(send)
                return
            more_body = message.get("more_body", False)

        sent = False

        async def replay_body() -> dict[str, Any]:
            nonlocal sent
            if sent:
                return {"type": "http.disconnect"}
            sent = True
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        await self.application(scope, replay_body, send)

    @staticmethod
    async def _reject(
        send: Any,
        status_code: int = 413,
        message: bytes = b"Request body exceeds the allowed size.",
    ) -> None:
        await send(
            {
                "type": "http.response.start",
                "status": status_code,
                "headers": [
                    (b"content-type", b"text/plain; charset=utf-8"),
                    (b"content-length", str(len(message)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": message})


app.add_middleware(RateLimitMiddleware)
app.add_middleware(RequestSizeLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


def _sample_order() -> Order:
    return Order(
        order_id="demo-order-001",
        name="Sample cabinet panel batch",
        parts=[
            Part(part_id="PANEL-A", length=600, width=400, quantity=4, material="MDF"),
            Part(part_id="PANEL-B", length=400, width=300, quantity=6, material="MDF"),
            Part(part_id="PANEL-C", length=250, width=200, quantity=8, material="MDF"),
        ],
    )


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    configured = supabase_is_configured()
    has_partial_config = bool(os.getenv("SUPABASE_URL", "").strip()) != bool(
        os.getenv("SUPABASE_ANON_KEY", "").strip()
    )
    if has_partial_config or (
        os.getenv("ENVIRONMENT", "development").lower() == "production" and not configured
    ):
        raise HTTPException(
            status_code=503,
            detail="Supabase authentication and persistence configuration is incomplete.",
        )
    return {
        "status": "ok",
        "mode": "authenticated-persistent" if configured else "development-demo",
    }


@app.get("/api/v1/demo/sample-order", response_model=Order, tags=["demo"])
def sample_order() -> Order:
    return _sample_order()


@app.get("/api/v1/demo/dataset", tags=["demo"])
def demo_dataset() -> dict[str, Any]:
    try:
        return load_demo_dataset().model_dump(mode="json")
    except (OSError, ValueError, RuntimeError) as exc:
        logger.exception("Demo dataset could not be loaded.")
        raise HTTPException(status_code=503, detail="Demo workspace data is unavailable.") from exc


@app.get("/api/v1/demo/sample-layout.png", tags=["demo"])
def demo_sample_layout() -> Response:
    try:
        image = DEMO_LAYOUT_IMAGE_PATH.read_bytes()
    except OSError as exc:
        logger.exception("Demo vision sample could not be loaded.")
        raise HTTPException(status_code=503, detail="Demo vision sample is unavailable.") from exc
    return Response(
        image,
        media_type="image/png",
        headers={"Content-Disposition": 'attachment; filename="scrapless-cutting-layout-sample.png"'},
    )


@app.post("/api/v1/demo/workspace/optimize", tags=["demo"])
def optimize_demo_workspace_batch(
    payload: DemoWorkspaceOptimizeRequest,
    current_user: AuthenticatedUser | None = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        dataset = load_demo_dataset()
    except (OSError, ValueError, RuntimeError) as exc:
        logger.exception("Demo dataset could not be loaded.")
        raise HTTPException(status_code=503, detail="Demo workspace data is unavailable.") from exc
    by_id = {record.order.order_id: record for record in dataset.records}
    records = []
    for order_id in payload.order_ids:
        record = by_id.get(order_id)
        if record is None:
            raise HTTPException(status_code=400, detail="An order is not part of this demo dataset.")
        records.append(record)
    if sum(sum(part.quantity for part in item.order.parts) for item in records) > MAX_DEMO_BATCH_INSTANCES:
        raise HTTPException(
            status_code=413,
            detail=f"A demo optimization batch may contain at most {MAX_DEMO_BATCH_INSTANCES} part instances.",
        )

    outcomes: list[DemoOptimizationOutcome] = []
    for record in records:
        created_at = datetime.combine(record.metadata.created_at, datetime.min.time(), timezone.utc)
        optimization = OptimizationInput(order=record.order, sheet_config=record.sheet_config)
        try:
            response = _execute_optimization(
                optimization,
                current_user,
                created_at,
                demo_dataset_id=dataset.dataset_id,
            )
        except HTTPException as exc:
            outcomes.append(DemoOptimizationOutcome(
                order_id=record.order.order_id,
                success=False,
                detail=str(exc.detail),
            ))
            continue
        is_valid = response.baseline.validation.valid and response.optimized.validation.valid
        outcomes.append(DemoOptimizationOutcome(
            order_id=record.order.order_id,
            success=is_valid,
            run_ids=[response.baseline.run_id, response.optimized.run_id],
            baseline_valid=response.baseline.validation.valid,
            optimized_valid=response.optimized.validation.valid,
            detail=None if is_valid else "One or both layouts did not pass geometric validation.",
        ))
    return {
        "dataset_id": dataset.dataset_id,
        "outcomes": [outcome.model_dump(mode="json") for outcome in outcomes],
    }


@app.delete("/api/v1/demo/workspace/{dataset_id}", tags=["demo"])
def reset_demo_workspace(
    dataset_id: str,
    current_user: AuthenticatedUser | None = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        canonical_id = load_demo_dataset().dataset_id
    except (OSError, ValueError, RuntimeError) as exc:
        logger.exception("Demo dataset could not be loaded.")
        raise HTTPException(status_code=503, detail="Demo workspace data is unavailable.") from exc
    if dataset_id != canonical_id:
        raise HTTPException(status_code=400, detail="Unknown demo dataset identifier.")

    if current_user:
        try:
            deleted = delete_owned_demo_runs(current_user, dataset_id)
        except SupabaseStorageError as exc:
            logger.warning("Demo optimization history reset failed.")
            raise HTTPException(status_code=503, detail="Demo optimization history could not be reset.") from exc
    else:
        matching = [run_id for run_id, marker in _demo_run_dataset.items() if marker == dataset_id]
        deleted = 0
        for run_id in matching:
            _runs.pop(run_id, None)
            _demo_run_dataset.pop(run_id, None)
            deleted += 1
    return {"dataset_id": dataset_id, "optimization_records_deleted": deleted}


@app.post("/api/v1/orders/validate", tags=["orders"])
async def validate_order_file(
    file: UploadFile = File(...),
    current_user: AuthenticatedUser | None = Depends(get_current_user),
) -> dict[str, Any]:
    del current_user
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=415, detail="Upload a .csv file.")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    try:
        parts, row_errors = parse_parts_csv(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    duplicate_ids = sorted(
        part_id for part_id, count in Counter(part.part_id for part in parts).items() if count > 1
    )
    for duplicate in duplicate_ids:
        row_errors.append({"row": None, "errors": [{"msg": f"Duplicate part_id: {duplicate}."}]})
    if len(parts) > 250:
        row_errors.append(
            {"row": None, "errors": [{"msg": "CSV may contain at most 250 part types."}]}
        )
    if sum(part.quantity for part in parts) > MAX_ORDER_PART_INSTANCES:
        row_errors.append(
            {
                "row": None,
                "errors": [
                    {
                        "msg": (
                            "CSV may contain at most "
                            f"{MAX_ORDER_PART_INSTANCES:,} part instances."
                        )
                    }
                ],
            }
        )
    return {
        "valid": not row_errors,
        "accepted_rows": len(parts),
        "parts": [part.model_dump() for part in parts],
        "errors": row_errors,
    }


@app.post("/api/v1/optimize", response_model=OptimizationResponse, tags=["optimization"])
def optimize(
    payload: OptimizationInput,
    current_user: AuthenticatedUser | None = Depends(get_current_user),
) -> OptimizationResponse:
    return _execute_optimization(payload, current_user, datetime.now(timezone.utc))


def _execute_optimization(
    payload: OptimizationInput,
    current_user: AuthenticatedUser | None,
    created_at: datetime,
    *,
    demo_dataset_id: str | None = None,
) -> OptimizationResponse:
    if not _optimization_capacity.acquire(blocking=False):
        raise HTTPException(
            status_code=503,
            detail="Optimization capacity is currently full; try again shortly.",
        )
    order = payload.order
    sheet = payload.sheet_config
    try:
        try:
            baseline = first_fit_decreasing(order, sheet)
            optimized = maxrects_bssf(order, sheet)
            if not baseline.validation.valid or not optimized.validation.valid:
                logger.warning("Layout validation failed.")
            improvements_valid = (
                baseline.validation.valid
                and optimized.validation.valid
                and optimized.metrics.unplaced_parts <= baseline.metrics.unplaced_parts
            )
            comparison = Comparison(
                sheet_count_difference=optimized.metrics.sheets_used
                - baseline.metrics.sheets_used,
                utilization_improvement_percentage_points=(
                    optimized.metrics.utilization_percent - baseline.metrics.utilization_percent
                    if improvements_valid
                    else None
                ),
                estimated_unused_area_reduction=(
                    baseline.metrics.unused_area - optimized.metrics.unused_area
                    if improvements_valid
                    else None
                ),
                estimated_material_cost_difference=(
                    optimized.metrics.material_cost - baseline.metrics.material_cost
                    if improvements_valid
                    else None
                ),
                unplaced_part_difference=optimized.metrics.unplaced_parts
                - baseline.metrics.unplaced_parts,
                runtime_difference_ms=optimized.runtime_ms - baseline.runtime_ms,
                improvements_valid=improvements_valid,
            )
            response = OptimizationResponse(
                baseline=baseline,
                optimized=optimized,
                comparison=comparison,
                risk_prediction=predict_risk(order, sheet),
                synthetic_data_disclaimer=SYNTHETIC_DATA_DISCLAIMER,
            )
        except Exception as exc:
            logger.exception("Optimization failed.")
            raise HTTPException(
                status_code=500, detail="Optimization could not be completed."
            ) from exc
        if current_user:
            save_optimization_runs(
                response,
                order,
                current_user,
                demo_dataset_id=demo_dataset_id,
                created_at=created_at if demo_dataset_id else None,
            )
        else:
            _remember_runs(response, order, created_at)
        if demo_dataset_id:
            for result in (response.baseline, response.optimized):
                _demo_run_dataset[result.run_id] = demo_dataset_id
        return response
    except SupabaseStorageError as exc:
        logger.warning("Optimization persistence failed.")
        raise HTTPException(
            status_code=503,
            detail="The optimization result could not be saved to your account.",
        ) from exc
    finally:
        _optimization_capacity.release()


def _remember_runs(
    response: OptimizationResponse, order: Order, created_at: datetime
) -> None:
    for result in (response.baseline, response.optimized):
        _runs[result.run_id] = (response, order, created_at)
        _runs.move_to_end(result.run_id)
    while len(_runs) > MAX_DEMO_RUNS:
        _runs.popitem(last=False)


def _get_run(
    run_id: str, current_user: AuthenticatedUser | None
) -> tuple[OptimizationResponse, AlgorithmResult, Order]:
    if current_user:
        try:
            record = get_owned_run(run_id, current_user)
        except SupabaseStorageError as exc:
            raise HTTPException(
                status_code=503, detail="Could not retrieve the saved optimization result."
            ) from exc
        if record is None:
            raise HTTPException(status_code=404, detail="Run not found.")
        try:
            report_payload = record["report_payload"]
            result = AlgorithmResult.model_validate(record["payload"])
            counterpart = AlgorithmResult.model_validate(report_payload["counterpart"])
            baseline, optimized = (
                (result, counterpart)
                if result.algorithm == "first_fit_decreasing"
                else (counterpart, result)
            )
            response = OptimizationResponse(
                baseline=baseline,
                optimized=optimized,
                comparison=Comparison.model_validate(report_payload["comparison"]),
                risk_prediction=RiskPrediction.model_validate(report_payload["risk_prediction"]),
                synthetic_data_disclaimer=report_payload["synthetic_data_disclaimer"],
            )
            order = Order.model_validate(report_payload["input_order"])
        except (KeyError, TypeError, ValidationError) as exc:
            raise HTTPException(
                status_code=503, detail="The saved optimization result is invalid."
            ) from exc
        return response, result, order

    stored = _runs.get(run_id)
    if stored is None:
        raise HTTPException(
            status_code=404, detail="Run not found. Development demo runs are not durable."
        )
    response, order, _ = stored
    result = response.baseline if response.baseline.run_id == run_id else response.optimized
    return response, result, order


@app.get("/api/v1/optimize/{run_id}", response_model=AlgorithmResult, tags=["optimization"])
def get_run(
    run_id: str, current_user: AuthenticatedUser | None = Depends(get_current_user)
) -> AlgorithmResult:
    return _get_run(run_id, current_user)[1]


@app.get("/api/v1/optimize/{run_id}/metrics", tags=["optimization"])
def get_metrics(
    run_id: str, current_user: AuthenticatedUser | None = Depends(get_current_user)
) -> dict[str, Any]:
    return _get_run(run_id, current_user)[1].metrics.model_dump()


@app.get("/api/v1/optimize/{run_id}/placements", tags=["optimization"])
def get_placements(
    run_id: str, current_user: AuthenticatedUser | None = Depends(get_current_user)
) -> list[dict[str, Any]]:
    return [
        placement.model_dump()
        for placement in _get_run(run_id, current_user)[1].placements
    ]


@app.get("/api/v1/history", tags=["history"])
def optimization_history(
    current_user: AuthenticatedUser | None = Depends(get_current_user),
) -> list[dict[str, Any]]:
    if current_user:
        try:
            return [
                {
                    "created_at": row["created_at"],
                    "result": row["payload"],
                    "demo_dataset_id": row.get("demo_dataset_id"),
                }
                for row in list_owned_runs(current_user)
                if row.get("created_at") and isinstance(row.get("payload"), dict)
            ]
        except SupabaseStorageError as exc:
            raise HTTPException(
                status_code=503, detail="Could not retrieve optimization history."
            ) from exc
    entries = {
        result.run_id: {
            "result": result,
            "created_at": created_at,
            "demo_dataset_id": _demo_run_dataset.get(result.run_id),
        }
        for response, _, created_at in _runs.values()
        for result in (response.baseline, response.optimized)
    }
    return [
        {
            "created_at": value["created_at"].isoformat(),
            "result": value["result"].model_dump(mode="json"),
            "demo_dataset_id": value["demo_dataset_id"],
        }
        for value in sorted(entries.values(), key=lambda item: item["created_at"], reverse=True)
    ]


def _analysis_entries(
    current_user: AuthenticatedUser | None,
) -> list[tuple[AlgorithmResult, datetime, str | None]]:
    if current_user:
        try:
            rows = list_owned_runs(current_user)
        except SupabaseStorageError as exc:
            raise HTTPException(
                status_code=503, detail="Could not retrieve analytics data."
            ) from exc
        entries = []
        for row in rows:
            try:
                created_at = datetime.fromisoformat(str(row["created_at"]).replace("Z", "+00:00"))
                result = AlgorithmResult.model_validate(row["payload"])
            except (KeyError, TypeError, ValueError, ValidationError) as exc:
                raise HTTPException(
                    status_code=503, detail="Saved analytics data is invalid."
                ) from exc
            demo_dataset_id = row.get("demo_dataset_id")
            entries.append((result, created_at, demo_dataset_id if isinstance(demo_dataset_id, str) else None))
        return entries
    return [
        (result, created_at, _demo_run_dataset.get(result.run_id))
        for response, _, created_at in _runs.values()
        for result in (response.baseline, response.optimized)
    ]


@app.get("/api/v1/analytics/overview", tags=["analytics"])
def analytics_overview(
    current_user: AuthenticatedUser | None = Depends(get_current_user),
) -> dict[str, Any]:
    unique_entries = {
        result.run_id: (result, demo_dataset_id)
        for result, _, demo_dataset_id in _analysis_entries(current_user)
    }
    values = [entry[0] for entry in unique_entries.values()]
    demo_results = sum(dataset_id is not None for _, dataset_id in unique_entries.values())
    return {
        "mode": (
            "Supabase account history; includes simulated demo runs"
            if current_user and demo_results
            else "Supabase account history"
            if current_user
            else "development demo; history is in memory only, with simulated demo timestamps"
            if demo_results
            else "development demo; history is in memory only"
        ),
        "demo_result_count": demo_results,
        "run_count": len(values),
        "sheets_used": sum(result.metrics.sheets_used for result in values),
        "requested_parts": sum(result.metrics.total_requested_parts for result in values),
        "average_utilization_percent": (
            sum(result.metrics.utilization_percent for result in values) / len(values)
            if values
            else None
        ),
        "estimated_unused_area": sum(result.metrics.unused_area for result in values),
        "estimated_material_cost": (
            sum(result.metrics.material_cost for result in values)
            if len({result.sheet_config.currency for result in values}) <= 1
            else None
        ),
        "cost_currency": next(iter({result.sheet_config.currency for result in values}), None)
        if len({result.sheet_config.currency for result in values}) <= 1
        else None,
    }


@app.get("/api/v1/analytics/trends", tags=["analytics"])
def analytics_trends(
    current_user: AuthenticatedUser | None = Depends(get_current_user),
) -> dict[str, Any]:
    entries = {
        result.run_id: (result, created_at, demo_dataset_id)
        for result, created_at, demo_dataset_id in _analysis_entries(current_user)
    }
    return {
        "mode": (
            "Supabase account history; demo timestamps are simulated"
            if current_user and any(demo_dataset_id for _, _, demo_dataset_id in entries.values())
            else "Supabase account history"
            if current_user
            else "development demo; demo timestamps are simulated"
            if any(demo_dataset_id for _, _, demo_dataset_id in entries.values())
            else "development demo; history is in memory only"
        ),
        "data": [
            {
                "date": created_at.date().isoformat(),
                "run_id": result.run_id,
                "order_id": result.order_id,
                "order_name": result.order_name,
                "algorithm": result.algorithm,
                "material": result.sheet_config.material,
                "currency": result.sheet_config.currency,
                "sheets_used": result.metrics.sheets_used,
                "utilization": result.metrics.utilization_percent,
                "unused_area": result.metrics.unused_area,
                "material_cost": result.metrics.material_cost,
                "demo_dataset_id": demo_dataset_id,
                "timestamp_is_simulated": demo_dataset_id is not None,
            }
            for result, created_at, demo_dataset_id in sorted(entries.values(), key=lambda item: item[1])
        ],
    }


@app.post("/api/v1/ml/predict-risk", response_model=RiskPrediction, tags=["machine-learning"])
def risk_prediction(
    payload: OptimizationInput,
    current_user: AuthenticatedUser | None = Depends(get_current_user),
) -> dict[str, Any]:
    del current_user
    return predict_risk(payload.order, payload.sheet_config)


@app.get("/api/v1/ml/evaluation", response_model=ModelEvaluation, tags=["machine-learning"])
def risk_evaluation() -> dict[str, object]:
    return model_evaluation()


@app.post("/api/v1/vision/detect", tags=["computer-vision"])
async def vision_detect(
    file: UploadFile = File(...),
    threshold: int = Query(default=180, ge=0, le=255),
    minimum_area: int = Query(default=400, ge=1, le=MAX_IMAGE_PIXELS),
    current_user: AuthenticatedUser | None = Depends(get_current_user),
) -> dict[str, object]:
    del current_user
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Upload a supported image file.")
    contents = await file.read(MAX_IMAGE_BYTES + 1)
    try:
        if not _vision_capacity.acquire(blocking=False):
            raise HTTPException(
                status_code=503,
                detail="Image processing capacity is currently full; try again shortly.",
            )
        try:
            return await run_in_threadpool(
                detect_rectangles, contents, threshold, minimum_area
            )
        finally:
            _vision_capacity.release()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/reports/{run_id}/json", tags=["reports"])
def json_report(
    run_id: str, current_user: AuthenticatedUser | None = Depends(get_current_user)
) -> Response:
    response, result, order = _get_run(run_id, current_user)
    return Response(
        build_json_report(result, response, order),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="scrapless-{run_id}.json"'},
    )


@app.get("/api/v1/reports/{run_id}/placements.csv", tags=["reports"])
def placements_report(
    run_id: str, current_user: AuthenticatedUser | None = Depends(get_current_user)
) -> PlainTextResponse:
    _, result, _ = _get_run(run_id, current_user)
    return PlainTextResponse(
        placements_csv(result),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="scrapless-{run_id}-placements.csv"'
        },
    )
