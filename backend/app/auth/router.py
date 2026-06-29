from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.google_oauth import (
    build_google_auth_url,
    exchange_code_for_user,
    google_oauth_debug,
)
from app.auth.models import User
from app.auth.utils import create_access_token, get_current_user, hash_password, verify_password
from app.config import settings
from app.database import get_db

router = APIRouter()


class SignupRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class UserResponse(BaseModel):
    name: str
    email: str

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


def auth_response(user: User) -> AuthResponse:
    token = create_access_token({"sub": user.email})
    return AuthResponse(
        access_token=token,
        user=UserResponse(name=user.name, email=user.email),
    )


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest, db: AsyncSession = Depends(get_db)):
    email = body.email.lower().strip()
    name = body.name.strip()

    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    user = User(
        name=name,
        email=email,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return auth_response(user)


@router.post("/login", response_model=AuthResponse)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    email = form.username.lower().strip()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    return auth_response(user)


@router.get("/google")
async def google_login():
    return RedirectResponse(url=build_google_auth_url())


@router.get("/google/callback")
async def google_callback(
    code: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    frontend = settings.FRONTEND_URL.rstrip("/")

    if error or not code:
        return RedirectResponse(url=f"{frontend}/auth/callback?error=google_denied")

    try:
        profile = await exchange_code_for_user(code)

        result = await db.execute(select(User).where(User.email == profile["email"]))
        user = result.scalar_one_or_none()

        if user:
            if user.google_id and user.google_id != profile["google_id"]:
                return RedirectResponse(url=f"{frontend}/auth/callback?error=account_conflict")
            if not user.google_id:
                user.google_id = profile["google_id"]
            if not (user.name or "").strip():
                user.name = profile["name"]
        else:
            user = User(
                name=profile["name"],
                email=profile["email"],
                google_id=profile["google_id"],
                hashed_password=None,
            )
            db.add(user)

        await db.commit()
        await db.refresh(user)

        token = create_access_token({"sub": user.email})
        return RedirectResponse(url=f"{frontend}/auth/callback?token={token}")
    except HTTPException:
        return RedirectResponse(url=f"{frontend}/auth/callback?error=google_failed")
    except Exception:
        return RedirectResponse(url=f"{frontend}/auth/callback?error=server_error")


@router.get("/google/status")
async def google_status():
    return google_oauth_debug()


@router.get("/me", response_model=UserResponse)
async def get_me(
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_user),
):
    result = await db.execute(select(User).where(User.email == current["email"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
