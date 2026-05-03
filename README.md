# TalentFlow — AI Recruitment Screener

TalentFlow is a small full-stack app for **automated first-round phone screening**: recruiters manage candidates in a dashboard, trigger **outbound voice calls** powered by **Bolna**, and receive **structured extraction** (scores, notice period, transcript, etc.) back via **webhook** into a **SQLite** database. The UI polls the API so the board updates without manual refresh after a call completes.

This document focuses on **what the code actually does** and how the pieces connect.

<img width="1469" height="797" alt="Screenshot 2026-05-03 at 11 31 07 PM" src="https://github.com/user-attachments/assets/3436a48b-a8e1-4eec-82ab-65a6d443d58e" />


---

## High-level architecture

```
┌─────────────┐     HTTP (Vite proxy)      ┌──────────────────┐
│  Browser    │ ─────────────────────────► │  Express API     │
│  React SPA  │   /api/* → localhost:3001   │  Node.js         │
└─────────────┘                            └────────┬─────────┘
                                                    │
                    ┌───────────────────────────────┼───────────────────────────────┐
                    │                               │                               │
                    ▼                               ▼                               ▼
            ┌───────────────┐              ┌────────────────┐                ┌──────────────┐
            │ SQLite file   │              │ Bolna REST     │                │ POST         │
            │ recruitment.db│              │ POST /call     │                │ /api/webhook │
            └───────────────┘              └────────┬───────┘                └──────▲───────┘
                    ▲                               │                               │
                    │                               │ outbound voice                │ final payload
                    │                               ▼                               │ (extracted_data)
                    │                      ┌────────────────┐                       │
                    └──────────────────────│ Candidate    │───────────────────────┘
                                           │ phone        │
                                           └────────────────┘
```

- **Frontend**: React 18 SPA, built with Vite. In dev, `vite.config.js` proxies `/api` to the backend (`http://localhost:3001`) so the browser can use same-origin `fetch("/api/...")`.
- **Backend**: Express 4, CommonJS, `cors` + `express.json()`, SQLite via `sqlite3` (callback API wrapped with small Promise helpers in `db.js`).
- **Voice / LLM provider**: [Bolna](https://bolna.ai) — the backend calls `https://api.bolna.ai/call` with `Authorization: Bearer <BOLNA_API_KEY>`, `agent_id`, `recipient_phone_number`, and `user_data` (e.g. `candidate_name`). You configure the agent in Bolna’s console (prompt, voice, extraction schema); this repo only orchestrates the HTTP call and persists results.

---

## Repository layout

| Path | Role |
|------|------|
| `backend/index.js` | Express app: middleware, mounts `/api/candidates`, `/api/webhook`, `/health`. Loads `.env` from `backend/.env` via `__dirname`. |
| `backend/db.js` | Opens `recruitment.db`, creates `candidates` table if missing, seeds 3 demo rows when empty, exports `getAll` / `getOne` / `run`. |
| `backend/screeningUpdate.js` | Shared `applyScreeningData()` — writes screening columns + `status = screened` (used by webhook and Bolna execution polling). |
| `backend/bolnaSync.js` | On each `GET /api/candidates`, polls Bolna execution API for rows stuck in `calling` (multiple URL fallbacks, throttled). |
| `backend/routes/candidates.js` | CRUD-ish API: list (triggers sync), create, trigger call, PATCH whitelist updates. |
| `backend/routes/webhook.js` | Bolna callback: resolves execution id from several payload keys, reads `smart_status` / `status`, finalizes when `extracted_data` is present or terminal `completed` / `stopped` (see code). |
| `frontend/` | Vite + React + Tailwind; dashboard, modals, polling. |

---

## Data model (SQLite)

Table: **`candidates`** (see `backend/db.js`).

- **Identity / contact**: `id`, `name`, `phone`, `email`.
- **Pipeline**: `status` — used values include `uploaded`, `calling`, `screened`, `shortlisted`, `rejected` (enforced on PATCH for `status`).
- **Bolna**: `bolna_call_id` — stored from Bolna’s create-call response (`execution_id` preferred, with fallbacks `call_id` / `id`).
- **Screening outputs** (typically filled by webhook from `extracted_data`): `years_of_experience`, `recent_role`, `skill_rating`, `notice_period`, `notice_flexible`, `expected_ctc`, `location_comfortable`, `call_completed`, `candidate_available`, `fit_score`, `recommendation`, `notes`, `transcript`.
- **Timestamps**: `created_at`, `screened_at`.

Integer columns `notice_flexible`, `location_comfortable`, `call_completed`, `candidate_available` are stored as `0`/`1` in SQLite; the candidates API maps them to booleans in JSON responses.

---

## HTTP API (backend)

Base URL in development: `http://localhost:3001` (or whatever `PORT` is).

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness: `{ status, timestamp }`. |
| `GET` | `/api/candidates` | All candidates, newest first. Before listing, syncs any `calling` rows by polling Bolna execution status (tries `GET /agent/{agent_id}/execution/{id}`, `/v2/...`, then `GET /executions/{id}`; throttled **~5s** per row). Rows move to **Screened** when Bolna reports **`completed`** / **`stopped`**, **or** as soon as **`extracted_data`** is a non-empty object (Bolna often fills extraction while `status` is still **`call-disconnected`**; `completed` may follow later). |
| `POST` | `/api/candidates` | Body: `{ name, phone, email? }`. Requires `name` and `phone`. |
| `POST` | `/api/candidates/:id/call` | Sets status `calling`, calls Bolna, persists `bolna_call_id` on success. |
| `PATCH` | `/api/candidates/:id` | Partial update; only keys in server whitelist (see `PATCH_WHITELIST` in `candidates.js`). Invalid `status` rejected. |
| `POST` | `/api/webhook` | Bolna post-call webhook (see below). |

**Bolna outbound call** (`POST /api/candidates/:id/call`):

- Request to Bolna: `POST https://api.bolna.ai/call` with JSON body containing `agent_id`, normalized E.164 `recipient_phone_number`, `user_data`, optional `from_phone_number`, and (unless `BOLNA_BYPASS_GUARDRAILS=false`) `bypass_call_guardrails: true`.
- Validates phone: must start with `+` after stripping spaces/dashes; otherwise **400** and status reverted.
- On non-OK HTTP from Bolna, status reverts toward `uploaded` and client gets **502** with `error` (includes Bolna’s `message` when present) and `details`.
- If HTTP OK but no `execution_id` / `call_id` / `id`, treated as failure and status reverted.
- Call id resolution tolerates multiple response shapes (`execution_id`, `call_id`, `id`).

**Webhook** (`POST /api/webhook`):

- Skips clearly **intermediate** events (e.g. ringing, in-progress) when there is no `extracted_data` yet; treats **`call-disconnected` without extraction** the same way (wait for extraction or `completed`).
- Finalizes when **`extracted_data`** is present (non-empty), or when status is **`completed`** / **`stopped`** (uses `smart_status` or `status`, case-insensitive). Terminal failures (no-answer, failed, …) without extraction reset the row to **uploaded** for retry.
- Resolves execution id: `id`, `execution_id`, `call_id`, nested `data.*` (see `webhook.js`).
- Looks up `candidates.bolna_call_id` with **`COLLATE NOCASE`**; on miss, logs stored ids and returns **200**.
- Parses `extracted_data` if it arrives as a JSON string; maps booleans for SQLite; uses shared **`applyScreeningData`**.

For production you should **authenticate or verify** webhooks (signature, shared secret, IP allowlist); this demo accepts any POST body shape that passes the guards above.

---

## Environment variables

Create `backend/.env` (loaded by `dotenv`):

| Variable | Required for | Description |
|----------|----------------|-------------|
| `BOLNA_API_KEY` | Outbound calls | Bolna API token. Paste the raw token only; the server sends `Authorization: Bearer …` (a leading `Bearer ` in `.env` is stripped automatically). |
| `BOLNA_AGENT_ID` | Outbound calls | UUID of the outbound agent from the Bolna dashboard. |
| `BOLNA_FROM_PHONE_NUMBER` | Sometimes | E.164 sender number if your Bolna workspace requires a purchased/connected **from** number for API calls. |
| `BOLNA_BYPASS_GUARDRAILS` | Optional | Defaults to **on** for API-initiated calls: sends `bypass_call_guardrails: true` so **“Screen Now”** is not blocked by the agent’s calling-hours window (dashboard “test” calls can still succeed when the API was failing). Set to `false` to enforce [calling guardrails](https://www.bolna.ai/docs/calling-guardrails). |
| `PORT` | Optional | HTTP listen port; default **3001**. |

Without valid Bolna credentials, the dashboard still loads and you can add candidates; **“Screen Now”** will fail at the Bolna step.

### `TalentFlow-AI-screener` vs `recruitment-screener`

Both folders in this workspace are the **same application** (one was effectively cloned). Use **one** checkout for day-to-day work. Each has its own `backend/.env` and `backend/recruitment.db`; credentials and candidate rows are **not** shared between folders.

---

## Bolna agent setup (dashboard)

Use this so outbound calls, extraction, and webhooks line up with this codebase.

1. **Create / select an outbound agent** in the [Bolna platform](https://platform.bolna.ai) and copy its **agent id** (UUID) into `BOLNA_AGENT_ID`.
2. **API key**: create a server/API token and set `BOLNA_API_KEY` (see env table above for Bearer handling).
3. **Dynamic variables**: the app sends `user_data: { candidate_name: "<name>" }`. In the agent prompt, use `{{candidate_name}}` (Bolna’s variable syntax) anywhere you personalize the script.
4. **Post-call extraction**: configure structured extraction so the final webhook includes an `extracted_data` object. Field names should match what `backend/routes/webhook.js` persists (types flexible; booleans can be `true`/`false`/`yes`/`no`):

   | Field | Role |
   |-------|------|
   | `years_of_experience` | number |
   | `recent_role` | string |
   | `skill_rating` | number (e.g. 1–10) |
   | `notice_period` | string |
   | `notice_flexible` | boolean |
   | `expected_ctc` | string |
   | `location_comfortable` | boolean |
   | `call_completed` | boolean |
   | `candidate_available` | boolean |
   | `fit_score` | number (e.g. 1–10) |
   | `recommendation` | string (`shortlist` / `maybe` / `reject` suggested) |
   | `notes` | string |

5. **Webhook URL** (dev): tunnel the backend (e.g. `ngrok http 3001`) and register `https://<host>/api/webhook` in Bolna so completed calls update SQLite. Intermediate events without `extracted_data` are ignored by design.
6. **Official API reference**: [Make call](https://docs.bolna.ai/api-reference/calls/make).

### Example system prompt — Aria (TalentFlow screener)

Paste and adapt in the Bolna agent **system / task** (or equivalent) configuration. Keep `{{candidate_name}}` so it matches `user_data` from this app.

```
## PERSONALITY
You are Aria, a warm and professional AI recruitment assistant calling on behalf of TalentFlow. You are friendly, clear, and efficient. You acknowledge each answer briefly before moving to the next question. You never sound robotic. You speak at a natural, conversational pace.

## TASK
You are conducting a short screening call with a candidate named {{candidate_name}} who applied for a Software Engineer role at TalentFlow. Your goal is to ask exactly 5 questions and complete the call in under 3 minutes.

## CALL SCRIPT - FOLLOW THIS EXACTLY IN ORDER

STEP 1 — CONFIRM AVAILABILITY
After the candidate responds to the welcome message, say:
"Hi {{candidate_name}}! I'm Aria, an AI recruitment assistant from TalentFlow, calling about your application for the Software Engineer role. Do you have about 3 minutes for a quick screening call?"

If YES: proceed to Question 1.
If NO or bad time: Say "No problem at all! Our team will reach out to reschedule. Have a great day!" Then end the call politely.

QUESTION 1 — EXPERIENCE
Ask: "Could you briefly tell me how many years of work experience you have, and what your most recent role was?"
After answer, say: "Great, thank you for sharing that."

QUESTION 2 — SKILL RATING
Ask: "On a scale of 1 to 10, how would you rate your overall technical skills for a software engineering role?"
After answer, say: "Noted, appreciate your honesty."

QUESTION 3 — NOTICE PERIOD
Ask: "What is your current notice period? And are you open to joining earlier if needed?"
After answer, say: "Understood."

QUESTION 4 — SALARY EXPECTATION
Ask: "What are your salary expectations for your next role? You can share a range if you prefer."
After answer, say: "Got it, thank you."

QUESTION 5 — LOCATION
Ask: "This role is a hybrid position based out of Bengaluru. Are you comfortable with that arrangement?"
Acknowledge based on their answer.

CLOSING
Say: "That's all from my end, {{candidate_name}}. Thank you so much for your time today. A member of our recruitment team will review your responses and reach out within 48 hours if you are shortlisted. Wishing you all the best!"
Then end the call.

## GUARDRAILS
- Do NOT skip any question under any circumstance
- Do NOT answer questions about role details, company details, or salary bands — say "our team will cover that in the next round"
- Do NOT make any hiring promises
- If asked "are you a bot or AI?" — say "Yes, I'm Aria, an AI assistant helping with initial screening"
- If candidate is rude or asks to stop — end politely immediately
- Stay strictly on script — do not engage in small talk or go off-topic
- If candidate gives very short answers, do not probe further — just move to the next question
```

### When “Screen Now” fails but the agent works in the dashboard

- **Calling guardrails**: API calls can be deferred or rejected outside allowed hours; this repo defaults to **`bypass_call_guardrails: true`** unless `BOLNA_BYPASS_GUARDRAILS=false`. See env table above.
- **Phone format**: Numbers must be **E.164** with a leading `+` (spaces are stripped). Example: `+919876543210`.
- **Network**: the backend must resolve `api.bolna.ai` (no DNS/VPN/firewall blocking).
- **Error details**: the API response body is logged as `Bolna API full response:` and returned in JSON `details`; the browser alert now includes that payload so you can read Bolna’s `message` without digging in DevTools.

---

## Frontend (technical)

- **Stack**: React 18, Vite 5, `@vitejs/plugin-react`, Tailwind CSS 3, PostCSS, `lucide-react` icons.
- **Data flow**: `App.jsx` fetches `GET /api/candidates` on mount and every **5 seconds** (`setInterval`) so the table reflects webhook updates without WebSockets.
- **UX**: Stats banner, sortable-style table presentation, add-candidate form, transcript modal, edit modal; status badges and fit score coloring are purely presentational.
- **Dev server**: Vite default port is **5173**; API calls use relative `/api/...` which the dev proxy forwards to the backend.

---

## Local development

### Prerequisites

- Node.js 18+ (LTS recommended; Vite 5 and current React tooling expect a modern runtime).
- npm (ships with Node).

### Backend

```bash
cd backend
npm install
npm start
# or: npm run dev   # nodemon
```

Server logs the URL (default `http://localhost:3001`). First boot creates `backend/recruitment.db` and may seed three candidates.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

### Webhook in local development

Bolna must reach your machine. Common approach:

```bash
ngrok http 3001
```

Register the HTTPS URL **path** `.../api/webhook` in Bolna’s webhook / analytics settings so post-call payloads hit your Express route.

---

## Production build (frontend)

```bash
cd frontend
npm run build
npm run preview   # optional: serve dist
```

The SPA expects API routes under `/api`; production deployments usually put the static `dist/` behind a reverse proxy that also routes `/api` to the Node service (same as Vite’s dev proxy pattern).

---

## Operational notes

- **Database file**: `backend/recruitment.db` is a local file; back it up or replace with a managed DB if you scale beyond a single instance.
- **node-fetch v2**: Backend uses CommonJS-compatible `node-fetch@2` for Bolna HTTP calls.
- **CORS**: Enabled for all origins in dev (`cors()` with defaults); tighten for production if the frontend is hosted on a fixed origin.
- **Agent configuration** (outside this repo): In Bolna you define the conversational agent, STT/TTS stack, and the **structured extraction** keys that populate `extracted_data`. Those keys should align with what `webhook.js` reads (`years_of_experience`, `recent_role`, `skill_rating`, etc.).

---

## Summary

| Concern | Choice in this project |
|---------|-------------------------|
| UI | React + Vite + Tailwind |
| API | Express on Node |
| Persistence | SQLite (`sqlite3`) |
| Voice screening | Bolna outbound API + webhook |
| Stuck on “Calling…” | `bolnaSync.js` polls Bolna execution until `extracted_data` appears or status is `completed` / `stopped` |
| Real-time UI | 5s polling to `/api/candidates` (each fetch can run Bolna sync for `calling` rows) |

This is intentionally a **compact integration demo**: clear HTTP boundaries, a single SQLite file, and a proxy-friendly SPA suitable for local demos and as a starting point for hardening (auth, webhook verification, migrations, and hosted DB).
