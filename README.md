# MailDesk

**A shared-inbox tool for a small company team.** MailDesk syncs several Gmail mailboxes over IMAP, sorts every email into priority categories, tracks which ones have been replied to, and lets people ask questions about their inbox in plain English — answered from the actual emails using retrieval-augmented generation.

Built by [Afzal Surti](https://github.com/AfzalSurti) for internal use at Geo Designs & Research Pvt. Ltd.

`Python` · `FastAPI` · `async SQLAlchemy` · `PostgreSQL + pgvector` · `OpenRouter` · `React 19` · `Vite` · `Zustand` · `Tailwind`

---

## What it does

- **Multi-mailbox sync** — connect several Gmail accounts with app passwords; emails are pulled over IMAP in a background job and the UI polls job progress.
- **Hybrid categorisation** — keyword rules settle obvious cases (security codes, invoices, newsletters); the rest are classified by an LLM in batches, with per-category priorities and per-mailbox category assignments.
- **Reply tracking** — the Sent folder is scanned to mark which emails already have a reply; status can also be set manually.
- **Ask your inbox** — a chat assistant answers questions like *"what invoices came in yesterday?"* using an inbox digest plus the most relevant emails retrieved from pgvector.
- **Attachments** — listed and downloaded on demand straight from IMAP, not stored.
- **Accounts** — email/password sign-up and Google OAuth; each user's data is isolated in their own workspace.

## How the AI parts are built

| Concern | Approach | Where |
|---|---|---|
| Classification cost | Keyword rules first; only unmatched emails go to the LLM, in batches; results cached per email | `app/emails/ai_service.py` |
| Retrieval | Each email is embedded (`text-embedding-3-small`) from sender, subject, category, preview and reply; top-8 cosine search in pgvector | `app/emails/rag.py` |
| Isolation | Every embedding and cache query filters on **both** `user_id` and `account_id` | `rag.py`, `chat_cache.py` |
| Re-embedding | Content is hashed; only changed emails are re-embedded, and embeddings for deleted emails are pruned | `rag.py` |
| Answer cache | Exact question-hash match first, then semantic match (cosine distance ≤ 0.08) — both keyed to an **inbox fingerprint**, so a cached answer is invalidated as soon as the inbox changes | `app/emails/chat_cache.py` |
| Reliability | Multiple OpenRouter keys; on 401/402/403/429 the client moves to the next key | `app/emails/openrouter_client.py` |
| Cost control | Every AI call is logged to `ai_usage_logs`; uncached chat calls are rate-limited per user | `app/emails/usage.py` |
| Secrets | Mailbox app passwords are encrypted at rest with Fernet | `app/accounts/service.py` |

## Architecture

```mermaid
flowchart LR
    Browser["React SPA<br/>(Zustand, Axios)"]
    subgraph Server["FastAPI — backend/main.py"]
        Auth["/auth<br/>JWT · Google OAuth"]
        Accts["/accounts"]
        Cats["/categories"]
        Emails["/emails<br/>sync · chat · categorize"]
        Jobs["/jobs<br/>progress polling"]
        BG["BackgroundTasks<br/>(in-process)"]
    end
    DB[("PostgreSQL + pgvector<br/>emails · email_embeddings<br/>chat_answer_cache · background_jobs")]
    Gmail["Gmail IMAP (SSL)"]
    LLM["OpenRouter<br/>gpt-4o-mini · embeddings"]

    Browser --> Auth & Accts & Cats & Emails & Jobs
    Emails --> BG
    BG --> Gmail
    BG --> LLM
    Emails --> LLM
    Server --> DB
```

Background work runs in-process via FastAPI `BackgroundTasks`, with job state in a Postgres table — no separate queue or worker. More detail in [ARCHITECTURE.md](ARCHITECTURE.md).

## Repository layout

```text
MailDesk/
├── backend/
│   ├── main.py                 # FastAPI app, routers, JSON error handler
│   ├── app/
│   │   ├── auth/               # signup/login, JWT, Google OAuth, default categories
│   │   ├── accounts/           # Gmail accounts, Fernet encryption, IMAP connection test
│   │   ├── categories/         # categories and per-account assignments
│   │   ├── emails/             # IMAP sync, classification, RAG, chat, cache, usage
│   │   ├── jobs/               # background job records
│   │   ├── config.py           # pydantic-settings
│   │   └── database.py         # async engine/session
│   ├── migrations/             # plain SQL — FULL_SCHEMA_NEW_NEON.sql + incremental files
│   ├── test_apis.py            # smoke test against a running server
│   └── requirements.txt
├── frontend/                   # React 19 + Vite SPA
├── ARCHITECTURE.md
└── DEPLOY.md                   # Render + Vercel + Neon guide
```

## Running locally

**Prerequisites:** Python 3.11+, Node.js 18+, PostgreSQL with the `vector` and `pgcrypto` extensions (Neon has both), an OpenRouter API key for the AI features.

### 1. Database

For a new database, run [`backend/migrations/FULL_SCHEMA_NEW_NEON.sql`](backend/migrations/FULL_SCHEMA_NEW_NEON.sql) once (e.g. in the Neon SQL editor or with `psql -f`). It creates all tables and enables `vector`.

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                # then fill in the values below
uvicorn main:app --reload --port 8001
```

Generate the two secrets:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"                              # SECRET_KEY
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"  # ENCRYPTION_KEY
```

> `ENCRYPTION_KEY` must be a Fernet key — a random string will make the server fail on startup. Don't change it once mailboxes are connected, or their stored passwords can no longer be decrypted.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env                # VITE_API_URL=http://127.0.0.1:8001
npm run dev                         # http://localhost:5173
```

Create an account from the sign-up page, then add a Gmail mailbox with an [app password](https://myaccount.google.com/apppasswords).

### Environment variables (`backend/.env`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql+asyncpg://USER:PASSWORD@HOST/DB?ssl=require` |
| `SECRET_KEY` | yes | JWT signing secret |
| `ENCRYPTION_KEY` | yes | Fernet key (see above) |
| `FRONTEND_URL` | yes | Allowed CORS origin(s), comma-separated |
| `OPENROUTER_API_KEY` | for AI | One key or several, comma-separated |
| `MODEL_NAME` | no | Default `openai/gpt-4o-mini` |
| `BACKEND_URL` | no | Default `http://localhost:8001`; used for the OAuth callback |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | Enables "Sign in with Google" |
| `ACCESS_TOKEN_EXPIRE_MINUTES`, `DEBUG` | no | Defaults 1440 / false |

## API overview

Interactive docs at `http://127.0.0.1:8001/docs` once the server runs.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`, `GET /auth/google`, `GET /auth/google/callback` |
| Mailboxes | `GET/POST /accounts`, `PATCH/DELETE /accounts/{id}` |
| Categories | `GET/POST /categories`, `PUT /categories/{id}/accounts`, `DELETE /categories/{id}` |
| Emails | `POST /emails/{account_id}/sync`, `GET /emails/{account_id}`, `GET /emails/{account_id}/{uid}`, attachments, `PATCH …/status`, `POST …/reply-done` |
| AI | `POST /emails/{account_id}/chat`, `POST /emails/{account_id}/recategorize`, `POST /emails/{account_id}/{uid}/categorize` |
| Jobs | `GET /jobs/{job_id}` |

## Testing

`backend/test_apis.py` is a smoke test that calls each endpoint against a **running** server (`python test_apis.py`); set the credentials at the top of the file to a test account first. There are no unit tests yet.

## Deployment

- **Managed:** Render (API) + Vercel (frontend) + Neon (database) — see [DEPLOY.md](DEPLOY.md).
- **Self-hosted:** the production instance runs on a Linux VPS with nginx in front of uvicorn and PM2 managing processes — see [ARCHITECTURE.md](ARCHITECTURE.md).

## Known limitations

- Background jobs run inside the API process, so a restart interrupts an in-flight sync.
- Gmail access uses IMAP with app passwords rather than the Gmail API with OAuth scopes.
- Migrations are hand-written SQL files rather than Alembic revisions.
- No unit tests or CI yet.

## Possible next steps

- Unit tests for `rule_based_classify`, `normalize_classification` and the cache-fingerprint logic, run in CI.
- Move sync jobs to a worker queue so they survive restarts.
- Evaluate retrieval quality on a labelled set of inbox questions.
