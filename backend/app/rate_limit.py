from __future__ import annotations

import json
import threading
import time
from collections import defaultdict

from starlette.types import ASGIApp, Receive, Scope, Send

RATE_LIMITS: dict[tuple[str, str], tuple[int, int]] = {
    ("POST", "/api/v1/optimize"): (6, 60),
    ("POST", "/api/v1/orders/validate"): (15, 60),
    ("POST", "/api/v1/vision/detect"): (5, 60),
    ("POST", "/api/v1/ml/predict-risk"): (20, 60),
    ("GET", "/api/v1/ml/evaluation"): (10, 60),
    ("GET", "/api/v1/history"): (60, 60),
    ("GET", "/api/v1/analytics/overview"): (60, 60),
    ("GET", "/api/v1/analytics/trends"): (60, 60),
}
MAX_RATE_LIMIT_KEYS = 10_000


class RateLimitMiddleware:
    def __init__(self, application: ASGIApp) -> None:
        self.application = application
        self._counts: dict[tuple[str, str, int], int] = defaultdict(int)
        self._lock = threading.Lock()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.application(scope, receive, send)
            return
        limit = RATE_LIMITS.get((scope["method"], scope["path"]))
        if (
            limit is None
            and scope["method"] == "GET"
            and scope["path"].startswith(("/api/v1/optimize/", "/api/v1/reports/"))
        ):
            limit = (60, 60)
        if not limit:
            await self.application(scope, receive, send)
            return
        client = scope.get("client")
        remote = client[0] if client else "unknown"
        maximum, period = limit
        window = int(time.monotonic() // period)
        key = (remote, scope["path"], window)
        now = time.monotonic()
        with self._lock:
            stale = [item for item in self._counts if item[2] < window]
            for item in stale:
                del self._counts[item]
            if len(self._counts) >= MAX_RATE_LIMIT_KEYS and key not in self._counts:
                allowed = False
                status_code = 503
            else:
                self._counts[key] += 1
                allowed = self._counts[key] <= maximum
                status_code = 429
        if not allowed:
            await self._reject(send, status_code, period - int(now % period))
            return
        await self.application(scope, receive, send)

    @staticmethod
    async def _reject(send: Send, status_code: int, retry_after: int) -> None:
        body = json.dumps(
            {
                "detail": (
                    "Request rate limit exceeded; retry shortly."
                    if status_code == 429
                    else "Rate limit capacity is temporarily unavailable."
                )
            }
        ).encode()
        headers: list[tuple[bytes, bytes]] = [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode()),
        ]
        if status_code == 429:
            headers.append((b"retry-after", str(max(1, retry_after)).encode()))
        await send(
            {"type": "http.response.start", "status": status_code, "headers": headers}
        )
        await send({"type": "http.response.body", "body": body})
