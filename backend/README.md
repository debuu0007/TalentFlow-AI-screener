# 🎙️ TalentFlow — AI Recruitment Screener

An enterprise Voice AI application that automatically screens job candidates 
via phone calls and delivers structured results to a recruiter dashboard in real time.

## 🏗️ Architecture
```
Recruiter → Web App → Node.js Backend → Bolna Voice AI → Candidate's Phone
                              ↑                    ↓
                         SQLite DB  ←  Webhook (structured data)
```

## ✨ Features

- **Automated outbound calls** via Bolna Voice AI
- **5-question structured screening** by AI agent "Aria"
- **Auto-extraction** of: experience, skills, CTC, notice period, location fit
- **AI fit score** (1–10) + recommendation (shortlist/maybe/reject)
- **Live dashboard** — auto-updates via webhook within 30 seconds of call end
- **Full transcript** viewer with shortlist/reject actions

## 🚀 Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Node.js + qlite3) |
| Voice AI | Bolna (GPT-4o-mini + ElevenLabs + Deepgram) |
| Tunneling | ngrok (dev) |

## 📦 Setup

### Backend
```bash
cd backend
npm install

npm start
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Webhook (dev)
```bash
ngrok http 3001
# Paste https://xxx.ngrok-free.app/api/webhook into Bolna Analytics tab
```

## 🔄 Full Flow

1. Recruiter adds candidate (name + phone)
2. Clicks **▶ Screen Now** → backend triggers Bolna outbound call
3. Candidate's phone rings → Aria conducts 5-question interview
4. Call ends → Bolna fires webhook with transcript + extracted JSON
5. Backend updates candidate record in SQLite
6. Dashboard auto-refreshes → row shows score + recommendation
7. Recruiter clicks **👁 View** → sees full transcript + data
8. Recruiter clicks **✅ Shortlist** or **❌ Reject**

## 📊 Business Impact

| Metric | Before | After |
|---| Time to first screen | 3–7 days | < 3 minutes |
| Cost per candidate | ₹200–400 | ₹15–30 |
| Candidates/day | 50 (human) | Unlimited |

## 🤖 Bolna Agent Config

- **Agent:** Aria - Recruitment Screener
- **LLM:** GPT-4o-mini (temp: 0.1)
- **Voice:** ElevenLabs
- **Transcriber:** Deepgram nova-2
- **Extraction:** 12-field structured JSON post-call
