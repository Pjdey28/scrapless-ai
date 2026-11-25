from __future__ import annotations

import os
from dataclasses import dataclass, field
from uuid import UUID

import httpx
from fastapi import Header, HTTPException, status


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    access_token: str = field(repr=False)


def _supabase_settings() -> tuple[str | None, str | None]:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    key = os.getenv("SUPABASE_ANON_KEY", "").strip()
    return url or None, key or None


def supabase_is_configured() -> bool:
    url, key = _supabase_settings()
    return bool(url and key)


def require_production_configuration() -> None:
    if os.getenv("ENVIRONMENT", "development").lower() != "production":
        return
    url, key = _supabase_settings()
    if not url or not key:
        raise RuntimeError(
            "Production requires SUPABASE_URL and SUPABASE_ANON_KEY for API authentication."
        )
    if not url.startswith("https://"):
        raise RuntimeError("Production SUPABASE_URL must use HTTPS.")


def get_current_user(
    authorization: str | None = Header(default=None),
) -> AuthenticatedUser | None:
    url, key = _supabase_settings()
    has_partial_config = bool(url) != bool(key)
    if has_partial_config:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Backend authentication is not fully configured.",
        )
    if not url or not key:
        if os.getenv("ENVIRONMENT", "development").lower() == "production":
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Backend authentication is not configured.",
            )
        return None
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid Supabase access token is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = authorization[7:].strip()
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid Supabase access token is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        response = httpx.get(
            f"{url}/auth/v1/user",
            headers={"apikey": key, "Authorization": f"Bearer {access_token}"},
            timeout=5.0,
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase authentication is temporarily unavailable.",
        ) from exc

    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The Supabase access token is invalid or expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        user_id = str(UUID(response.json()["id"]))
    except (KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase returned an invalid authenticated-user response.",
        ) from None
    return AuthenticatedUser(id=user_id, access_token=access_token)
