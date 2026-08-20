from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import settings
from app.auth.router import router as auth_router
from app.accounts.router import router as accounts_router
from app.categories.router import router as categories_router
from app.emails.router import router as emails_router
from app.jobs.router import router as jobs_router

app = FastAPI(title="MailDesk API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/auth", tags=["Auth"])
app.include_router(accounts_router, prefix="/accounts", tags=["Accounts"])
app.include_router(categories_router, prefix="/categories", tags=["Categories"])
app.include_router(emails_router, prefix="/emails", tags=["Emails"])
app.include_router(jobs_router, prefix="/jobs", tags=["Jobs"])


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Return JSON errors so browsers still get CORS headers (unlike bare 500 text)."""
    message = str(exc)
    lower = message.lower()
    if "exceeded the data transfer quota" in lower or "quota" in lower:
        detail = "Database quota exceeded on Neon. Upgrade the Neon plan or wait for quota reset."
        status_code = 503
    elif "undefinedcolumn" in lower.replace(" ", "") or "does not exist" in lower:
        detail = (
            "Database schema is missing a column/table. "
            "Run pending Neon migrations (e.g. last_synced_at / ai_usage_logs)."
        )
        status_code = 500
    elif "connection" in lower or "ssl" in lower or "timeout" in lower:
        detail = "Database temporarily unavailable. Please try again."
        status_code = 503
    else:
        detail = "Internal server error"
        status_code = 500

    headers = {}
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") in settings.frontend_origins:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Vary"] = "Origin"

    return JSONResponse(
        status_code=status_code,
        content={"detail": detail},
        headers=headers,
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/health/db")
async def health_db():
    from sqlalchemy import text
    from app.database import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("select 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as exc:
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "database": "unavailable",
                "detail": str(exc)[:300],
            },
        )