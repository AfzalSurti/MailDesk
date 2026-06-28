# MailDesk

Company email management — Gmail sync, AI categorization, team dashboard.

## Stack

- **Frontend:** React, Vite, Tailwind, Zustand
- **Backend:** FastAPI, async SQLAlchemy, Neon PostgreSQL
- **AI:** OpenRouter (GPT-4o-mini)

## Local development

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
cp .env.example .env           # fill in values
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Default login: `admin@company.com` / `admin123` (change after first login in production).

## Deployment

See **[DEPLOY.md](./DEPLOY.md)** — backend on **Render** (Python, no Docker), frontend on **Vercel**, DB on **Neon**.
