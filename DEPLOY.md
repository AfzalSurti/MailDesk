# Deploy MailDesk (Render + Vercel + Neon)

| Piece | Host |
|-------|------|
| Database | [Neon](https://neon.tech) |
| API (backend) | [Render](https://render.com) — Python web service, **no Docker** |
| Frontend | [Vercel](https://vercel.com) |

Repo: `https://github.com/AfzalSurti/MailDesk`

---

## 1. Database (Neon)

If you already used this DB locally, run the latest migration instead of full init:

```
backend/migrations/add_user_auth_fields.sql
```

For a **new** database, run `backend/migrations/init.sql`.

Copy your connection string and use async format:

```
postgresql+asyncpg://USER:PASSWORD@HOST/DBNAME?sslmode=require
```

(Replace `postgresql://` with `postgresql+asyncpg://` if Neon gives the sync URL.)

---

## 2. Generate secrets

```bash
python -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(32)); print('ENCRYPTION_KEY=' + secrets.token_urlsafe(32))"
```

Save both. **Never change `ENCRYPTION_KEY` after Gmail passwords are saved** — you would have to re-add the Gmail account.

---

## 3. Push code to GitHub

```bash
git add .
git commit -m "Prepare for Render + Vercel deploy"
git push origin main
```

---

## 4. Backend on Render (manual — no Blueprint, no Docker)

1. Go to [Render Dashboard](https://dashboard.render.com) → **New +** → **Web Service**.
2. Connect GitHub and select the **MailDesk** repo (pick the project normally — no Blueprint).
3. Settings:

   | Field | Value |
   |-------|--------|
   | **Name** | `maildesk-api` (or whatever you like) |
   | **Root Directory** | `backend` |
   | **Runtime** | **Python 3** |
   | **Build Command** | `pip install -r requirements.txt` |
   | **Start Command** | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
   | **Health Check Path** | `/health` |

4. Add **Environment Variables**:

   | Key | Value |
   |-----|--------|
   | `DATABASE_URL` | Your Neon async URL |
   | `SECRET_KEY` | From step 2 |
   | `ENCRYPTION_KEY` | From step 2 |
   | `OPENROUTER_API_KEY` | Your OpenRouter key |
   | `OPENROUTER_MODEL` | `openai/gpt-4o-mini` |
   | `DEBUG` | `false` |
   | `FRONTEND_URL` | Your Vercel URL — **exact match**, e.g. `https://mail-desk-one.vercel.app` (no trailing `/`) |
   | `BACKEND_URL` | Your Render API URL, e.g. `https://maildesk-sk5r.onrender.com` |
   | `GOOGLE_CLIENT_ID` | From Google Cloud Console OAuth client |
   | `GOOGLE_CLIENT_SECRET` | From Google Cloud Console OAuth client |

5. Click **Create Web Service** and wait for deploy.
6. Copy your API URL, e.g. `https://maildesk-api.onrender.com`.
7. Test: open `https://<your-api-url>/health` → `{"status":"ok"}`.

---

## 5. Frontend on Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard) → **Add New** → **Project**.
2. Import the **MailDesk** repo from GitHub.
3. Settings:

   | Field | Value |
   |-------|--------|
   | **Root Directory** | `frontend` (click Edit and set this) |
   | **Framework Preset** | Vite (auto-detected) |
   | **Build Command** | `npm run build` |
   | **Output Directory** | `dist` |

4. **Environment Variables** (required — Vite reads these at build time):

   | Key | Value |
   |-----|--------|
   | `VITE_API_URL` | Your Render API URL, e.g. `https://maildesk-api.onrender.com` |

   No trailing slash.

5. Deploy. Copy your Vercel URL, e.g. `https://maildesk.vercel.app`.

---

## 6. Connect frontend ↔ backend (CORS)

1. Back on **Render** → your web service → **Environment**.
2. Set `FRONTEND_URL` to your **exact Vercel URL** (https, no trailing slash):

   ```
   https://maildesk.vercel.app
   ```

3. **Save** — Render will redeploy the API automatically.

If you add a custom domain on Vercel later, update `FRONTEND_URL` on Render to match.

---

## 7. Verify

1. Open your Vercel URL → landing page loads.
2. Log in: `admin@company.com` / `admin123`.
3. **Settings** → add Gmail + [App Password](https://myaccount.google.com/apppasswords).
4. **Fetch** → emails sync.

---

## Production checklist

- [ ] Change admin password after first login.
- [ ] OpenRouter account has credits.
- [ ] Custom domain (optional): set on Vercel, then update `FRONTEND_URL` on Render.

---

## Free tier notes

- Render free tier **sleeps** after ~15 min idle. First request can take 30–60s (cold start).
- Sync / bulk re-categorize can take a while — keep the tab open.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| CORS error | `FRONTEND_URL` on Render must match Vercel URL exactly (https, no `/` at end). Redeploy API. |
| API calls go to localhost | Set `VITE_API_URL` on Vercel and **redeploy** (env vars are baked in at build time). |
| 502 on sync | Check Render logs; verify Gmail app password and `DATABASE_URL`. |
| `/dashboard` 404 on refresh | `frontend/vercel.json` handles SPA routing — redeploy Vercel if missing. |
| Wrong categories | **Categories → Re-categorize all emails** after fixing OpenRouter key. |
