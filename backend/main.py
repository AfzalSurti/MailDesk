from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.auth.router import router as auth_router
from app.accounts.router import router as accounts_router
from app.categories.router import router as categories_router
from app.emails.router import router as emails_router

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

@app.get("/health")
async def health():
    return {"status": "ok"}