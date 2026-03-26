"""Centralized error handling for the OnTrail API."""
import logging
import traceback
from datetime import datetime
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse

logger = logging.getLogger("ontrail")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


class OnTrailError(Exception):
    def __init__(self, status_code: int, detail: str, error_type: str = "error"):
        self.status_code = status_code
        self.detail = detail
        self.error_type = error_type


class NoSlotsError(OnTrailError):
    def __init__(self, detail: str = "No available POI slots in this grid cell"):
        super().__init__(409, detail, "no_slots")


class InsufficientBalanceError(OnTrailError):
    def __init__(self, required: str, available: str):
        super().__init__(402, f"Insufficient balance. Required: {required}, Available: {available}", "insufficient_balance")


class FraudDetectedError(OnTrailError):
    def __init__(self, flags: list):
        super().__init__(403, f"Fraud detected: {', '.join(flags)}", "fraud_detected")


class MissingCheckinsError(OnTrailError):
    def __init__(self, missing_pois: list):
        super().__init__(400, f"Missing check-ins for: {', '.join(missing_pois)}", "missing_checkins")


class TGENotReadyError(OnTrailError):
    def __init__(self, pool: str, threshold: str):
        super().__init__(403, f"Pool ({pool}) has not reached threshold ({threshold})", "tge_not_ready")


def register_error_handlers(app: FastAPI):
    @app.exception_handler(OnTrailError)
    async def ontrail_error_handler(request: Request, exc: OnTrailError):
        logger.warning(f"{exc.error_type}: {exc.detail} | path={request.url.path}")
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.error_type, "detail": exc.detail},
        )

    @app.exception_handler(HTTPException)
    async def http_error_handler(request: Request, exc: HTTPException):
        logger.warning(f"HTTP {exc.status_code}: {exc.detail} | path={request.url.path}")
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": "http_error", "detail": exc.detail},
        )

    @app.exception_handler(Exception)
    async def general_error_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled error: {exc} | path={request.url.path}\n{traceback.format_exc()}")
        return JSONResponse(
            status_code=500,
            content={"error": "internal_error", "detail": "An unexpected error occurred. Please try again."},
        )

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        start = datetime.utcnow()
        response = await call_next(request)
        duration = (datetime.utcnow() - start).total_seconds()
        if duration > 0.5:
            logger.warning(f"Slow request: {request.method} {request.url.path} took {duration:.3f}s")
        return response
