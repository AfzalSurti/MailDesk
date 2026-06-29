from urllib.parse import urlencode

import httpx
from fastapi import HTTPException

from app.config import settings

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_SCOPES = "openid email profile"


def google_oauth_configured() -> bool:
    return bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)


def build_google_auth_url() -> str:
    if not google_oauth_configured():
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": GOOGLE_SCOPES,
        "access_type": "online",
        "prompt": "select_account",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def exchange_code_for_user(code: str) -> dict:
    if not google_oauth_configured():
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")

    async with httpx.AsyncClient(timeout=15.0) as client:
        token_res = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

        if token_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Google sign-in failed")

        access_token = token_res.json().get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="Google sign-in failed")

        user_res = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )

        if user_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Could not load Google profile")

        profile = user_res.json()
        google_id = profile.get("sub")
        email = profile.get("email")
        name = profile.get("name") or profile.get("given_name") or email

        if not google_id or not email:
            raise HTTPException(status_code=400, detail="Google account missing email")

        return {"google_id": google_id, "email": email.lower(), "name": name}
