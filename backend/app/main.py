from __future__ import annotations

import logging
import os
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, Response

from app.csv_import import MAX_UPLOAD_BYTES, parse_parts_csv
from app.ml.risk import model_evaluation, predict_risk
from app.optimization.packing import first_fit_decreasing, maxrects_bssf
from app.reports import build_json_report, placements_csv
from app.schemas import (
    AlgorithmResult,
    Comparison,
    ModelEvaluation,
    OptimizationInput,
    OptimizationResponse,
    Order,
    Part,
    RiskPrediction,
)
from app.vision.detector import MAX_IMAGE_BYTES, detect_rectangles

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("scrapless")
app = FastAPI(
    title="ScrapLess AI API", version="0.1.0", description="Rectangular sheet-cutting analysis API."
)
origins = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").split(",")
    if origin.strip()
]
# In-process storage is intentionally demo-only and is cleared on restart.
_runs: dict[str, tuple[OptimizationResponse, Order, datetime]] = {}
SYNTHETIC_DATA_DISCLAIMER = "Scrap-risk estimates use a reproducible synthetic training dataset and are not industry-validated."


class RequestSizeLimitMiddleware:
    def __init__(self, application: Any) -> None:
        self.application = application

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http" or scope["method"] != "POST":
            await self.application(scope, receive, send)
            return

        path = scope["path"]
        limit = MAX_IMAGE_BYTES if path.endswith("/vision/detect") else MAX_UPLOAD_BYTES
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


app.add_middleware(RequestSizeLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
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
    return {"status": "ok", "mode": "demo/in-memory"}


@app.get("/api/v1/demo/sample-order", response_model=Order, tags=["demo"])
def sample_order() -> Order:
    return _sample_order()


@app.post("/api/v1/orders/validate", tags=["orders"])
async def validate_order_file(file: UploadFile = File(...)) -> dict[str, Any]:
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
    return {
        "valid": not row_errors,
        "accepted_rows": len(parts),
        "parts": [part.model_dump() for part in parts],
        "errors": row_errors,
    }


@app.post("/api/v1/optimize", response_model=OptimizationResponse, tags=["optimization"])
def optimize(payload: OptimizationInput) -> OptimizationResponse:
    order = payload.order
    sheet = payload.sheet_config
    try:
        baseline = first_fit_decreasing(order, sheet)
        optimized = maxrects_bssf(order, sheet)
        if not baseline.validation.valid or not optimized.validation.valid:
            logger.warning("Layout validation failed for order %s", order.order_id)
        improvements_valid = (
            baseline.validation.valid
            and optimized.validation.valid
            and optimized.metrics.unplaced_parts <= baseline.metrics.unplaced_parts
        )
        comparison = Comparison(
            sheet_count_difference=optimized.metrics.sheets_used - baseline.metrics.sheets_used,
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
        logger.exception("Optimization failed for order %s", order.order_id)
        raise HTTPException(status_code=500, detail="Optimization could not be completed.") from exc
    created_at = datetime.now(timezone.utc)
    _runs[baseline.run_id] = (response, order, created_at)
    _runs[optimized.run_id] = (response, order, created_at)
    return response


def _get_run(run_id: str) -> tuple[OptimizationResponse, AlgorithmResult]:
    stored = _runs.get(run_id)
    if stored is None:
        raise HTTPException(
            status_code=404, detail="Run not found. Demo runs are not persisted across restarts."
        )
    response, _, _ = stored
    result = response.baseline if response.baseline.run_id == run_id else response.optimized
    return response, result


@app.get("/api/v1/optimize/{run_id}", response_model=AlgorithmResult, tags=["optimization"])
def get_run(run_id: str) -> AlgorithmResult:
    return _get_run(run_id)[1]


@app.get("/api/v1/optimize/{run_id}/metrics", tags=["optimization"])
def get_metrics(run_id: str) -> dict[str, Any]:
    return _get_run(run_id)[1].metrics.model_dump()


@app.get("/api/v1/optimize/{run_id}/placements", tags=["optimization"])
def get_placements(run_id: str) -> list[dict[str, Any]]:
    return [placement.model_dump() for placement in _get_run(run_id)[1].placements]


@app.get("/api/v1/history", tags=["history"])
def optimization_history() -> list[dict[str, Any]]:
    entries = {
        result.run_id: {"result": result, "created_at": created_at}
        for response, _, created_at in _runs.values()
        for result in (response.baseline, response.optimized)
    }
    return [
        {
            "created_at": value["created_at"].isoformat(),
            "result": value["result"].model_dump(mode="json"),
        }
        for value in sorted(entries.values(), key=lambda item: item["created_at"], reverse=True)
    ]


@app.get("/api/v1/analytics/overview", tags=["analytics"])
def analytics_overview() -> dict[str, Any]:
    results = [
        result
        for response, _, _ in _runs.values()
        for result in (response.baseline, response.optimized)
    ]
    unique = {result.run_id: result for result in results}.values()
    values = list(unique)
    return {
        "mode": "in-memory demo; history is not durable",
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
def analytics_trends() -> dict[str, Any]:
    entries = {
        result.run_id: (result, created_at)
        for response, _, created_at in _runs.values()
        for result in (response.baseline, response.optimized)
    }
    return {
        "mode": "in-memory demo; trends are cleared on restart",
        "data": [
            {
                "date": created_at.date().isoformat(),
                "run_id": result.run_id,
                "order_name": result.order_name,
                "algorithm": result.algorithm,
                "material": result.sheet_config.material,
                "currency": result.sheet_config.currency,
                "sheets_used": result.metrics.sheets_used,
                "utilization": result.metrics.utilization_percent,
                "unused_area": result.metrics.unused_area,
                "material_cost": result.metrics.material_cost,
            }
            for result, created_at in sorted(entries.values(), key=lambda item: item[1])
        ],
    }


@app.post("/api/v1/ml/predict-risk", response_model=RiskPrediction, tags=["machine-learning"])
def risk_prediction(payload: OptimizationInput) -> dict[str, Any]:
    return predict_risk(payload.order, payload.sheet_config)


@app.get("/api/v1/ml/evaluation", response_model=ModelEvaluation, tags=["machine-learning"])
def risk_evaluation() -> dict[str, object]:
    return model_evaluation()


@app.post("/api/v1/vision/detect", tags=["computer-vision"])
async def vision_detect(
    file: UploadFile = File(...),
    threshold: int = 180,
    minimum_area: int = 400,
) -> dict[str, object]:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Upload a supported image file.")
    if not 0 <= threshold <= 255 or minimum_area < 1:
        raise HTTPException(
            status_code=422, detail="Threshold must be 0–255 and minimum_area must be positive."
        )
    contents = await file.read(MAX_IMAGE_BYTES + 1)
    try:
        return detect_rectangles(contents, threshold, minimum_area)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/reports/{run_id}/json", tags=["reports"])
def json_report(run_id: str) -> Response:
    response, result = _get_run(run_id)
    order = _runs[run_id][1]
    return Response(
        build_json_report(result, response, order),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="scrapless-{run_id}.json"'},
    )


@app.get("/api/v1/reports/{run_id}/placements.csv", tags=["reports"])
def placements_report(run_id: str) -> PlainTextResponse:
    _, result = _get_run(run_id)
    return PlainTextResponse(
        placements_csv(result),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="scrapless-{run_id}-placements.csv"'
        },
    )
