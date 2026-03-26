"""Security middleware and utilities."""
import re
import html
from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware


def sanitize_string(value: str) -> str:
    """Sanitize input string to prevent XSS and SQL injection."""
    if not isinstance(value, str):
        return value
    value = html.escape(value)
    # Remove common SQL injection patterns
    dangerous = [";--", "';", "/*", "*/", "xp_", "UNION SELECT", "DROP TABLE"]
    for pattern in dangerous:
        value = value.replace(pattern, "")
    return value.strip()


def validate_wallet_address(address: str) -> bool:
    """Validate Ethereum wallet address format."""
    return bool(re.match(r"^0x[0-9a-fA-F]{40}$", address))


def validate_username(username: str) -> bool:
    """Validate username: 3-20 chars, alphanumeric + underscores."""
    return bool(re.match(r"^[a-zA-Z0-9_]{3,20}$", username))


def validate_coordinates(lat: float, lon: float) -> bool:
    return -90 <= lat <= 90 and -180 <= lon <= 180


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(self)"
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


def register_security(app: FastAPI):
    app.add_middleware(SecurityHeadersMiddleware)
