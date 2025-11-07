## DonDonDonki SPM — Tasks, Projects, Reminders

A full‑stack task and project manager with activity logs, reminders, file attachments, and report exports. This repo is a small monorepo with a React frontend and an Express API backed by Supabase (PostgreSQL).

### Monorepo layout

```text
.
├─ backend/                 # Express API (Node.js)
│  ├─ src/
│  │  ├─ app.js            # Express app (shared by server and Vercel fn)
│  │  ├─ index.js          # Node server entry (port listener + schedulers)
│  │  ├─ routes/           # REST endpoints (tasks, projects, users, etc.)
│  │  ├─ services/         # email, reminders, reports, activity log
│  │  └─ config/env.js     # env loading/validation
│  ├─ api/[...slug].js     # Vercel serverless catch‑all for /api/*
│  ├─ Procfile             # Heroku-style process file (optional)
│  └─ vercel.json          # Vercel routing + cron config
├─ frontend/               # React app (CRA)
│  └─ vercel.json          # Vercel project settings (optional)
├─ supabase/               # DB schema + seed
├─ testing/                # Jest test harness for backend
├─ SETUP.md                # DB setup & activity log notes
└─ TECHSTACK.md            # High-level architectural notes
```

## Requirements

- Node.js 18+ and npm 9+
- A Supabase project (for PostgreSQL and Auth)

## Quick start

1) Install dependencies

```bash
cd frontend && npm install
cd ../backend && npm install
```

2) Create and fill environment files

- backend: create `backend/.env` (see Environment variables below)


4) Run locally

```bash
# Terminal 1
cd backend
npm start     # http://localhost:4000 (GET /health)

# Terminal 2
cd frontend
npm start       # http://localhost:3000
```

## Environment variables

### Backend (`backend/.env`)

- SUPABASE_URL: your Supabase project URL
- SUPABASE_ANON_KEY: your Supabase anon key
- SUPABASE_SERVICE_ROLE_KEY: service role key (required unless MOCK_API=true or NODE_ENV=test)
- CORS_ORIGIN: comma‑separated list of allowed origins (e.g. `http://localhost:3000`)
- PORT: API port (default 4000)
- NODE_ENV: development
- SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM: SMTP settings for email notifications

Environment validation will throw if required Supabase vars are missing, except in tests or when `MOCK_API=true`.

### Frontend (optional, `frontend/.env`)

- REACT_APP_API_BASE: base URL of the API. Optional; defaults to `http://localhost:4000/api`.

Only needed if you want to override the default, for example when your API runs on a different host/port or in the cloud:

```env
REACT_APP_API_BASE=https://your-api.example.com/api
```

## Running locally

- Backend: `npm start` inside `backend` starts the API on port 4000. Health checks: `GET /health` and `GET /api/health`.

- Frontend: `npm start` inside `frontend` serves the app on port 3000.

Make sure `CORS_ORIGIN` includes your frontend origin (e.g. `http://localhost:3000`).

## Database (Supabase)

Follow the instructions in SETUP.md:

- Apply `supabase/schema.sql` first.
- Optionally apply `supabase/seed.sql` for sample content.
- Activity logs live in `public.task_activity_logs` (see SETUP.md for fields and indexing).

## API overview

- Base URL: `${REACT_APP_API_BASE}` (default `http://localhost:4000/api`)
- Health: `GET /api/health` → `{ status: "ok" }`

### Auth

- POST `/api/auth/signup` → `{ user }`
- POST `/api/auth/signin` → `{ session, user, profile }`
- POST `/api/auth/signout`
- POST `/api/auth/change-password` → `{ message }`

### Tasks (selected examples)

- GET `/api/tasks` — list tasks (supports pagination and access controls)
- GET `/api/tasks/:id` — fetch a single task (respecting permissions)
- PATCH `/api/tasks/:id` — update fields (title, description, project, due_date, owner/assignee, members)
- PATCH `/api/tasks/:id/status?acting_user_id=...` — update status
- GET `/api/tasks/:id/ancestors` — minimal chain to root
- GET `/api/tasks/:id/descendants` — subtree (if permitted)

### Activity log

- GET `/api/tasks/:id/activity?acting_user_id=...&limit=50&offset=0`
- POST `/api/tasks/:id/comments` with `{ acting_user_id, comment }`

### Attachments and reminders

- Endpoints exist for file attachments and per‑task reminders; see `backend/src/routes/index.js` for the full set.

Notes:

- Access is role‑aware (e.g., managers/directors/HR see more per the org rules).
- Many endpoints accept `acting_user_id` to evaluate permissions.

## Testing

Backend route tests live under `testing/` and run fully in memory with mocks.

```bash
cd testing
npm install
npm test

```

## Deployment

### Vercel (serverless API)

- `backend/api/[...slug].js` exports the Express app as a serverless function.
- `backend/vercel.json` routes `/api/*` to that function and defines two sample cron jobs:
  - `/api/reminders/check` daily at 09:00
  - `/api/overdue/check` daily at 08:00
- Set all backend env vars in your Vercel project. Frontend can be a separate Vercel project pointing `REACT_APP_API_BASE` at the deployed API.
