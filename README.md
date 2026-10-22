# CareerLens AI

**AI-Powered Resume Intelligence & Career Recommendation Platform**

CareerLens AI is a college placement platform that helps students understand their resume, identify skill gaps, and move toward better-fit opportunities. The application includes student workflows, job browsing and recommendations, backend APIs, and an AI-service boundary; this repository continues to evolve toward broader placement-team workflows.

## Problem and Objectives

Students often receive generic resume feedback while placement teams lack a clear view of readiness and recurring skill gaps. CareerLens AI is designed to connect resume intelligence, career direction, job matching, application tracking, and college placement analytics in one system.

The frontend is built with React, the product API with Express, and the separate AI service with FastAPI. MongoDB Atlas configuration, environment templates, and health checks are provided. Job records are only surfaced when they pass the shared active, verification, expiry, and recent-availability filters.

## Technology Stack

- Frontend: React, Vite, React Router, Axios, CSS
- Backend: Node.js, Express, Mongoose, dotenv, cors
- AI service: Python, FastAPI, Uvicorn, python-dotenv
- Database: MongoDB Atlas

## Architecture

The browser calls the Node API through `VITE_API_URL`. The Node service owns product APIs and the MongoDB connection. The separate FastAPI service will later own document extraction, NLP, scoring, matching, and recommendation workloads.

```text
frontend (8080) -> backend API (5000) -> MongoDB Atlas
                         |
                         +-> ai-service (8000)
```

## Folder Structure

```text
AI-RESUME SCREENING/
├── frontend/       React product experience
├── backend/        Express API and database boundary
├── ai-service/     FastAPI AI foundation
├── README.md
└── .gitignore
```

## Setup

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:8080`. Build with `npm run build`.

### Backend

```powershell
cd backend
npm install
Copy-Item .env.example .env
npm run dev
```

Set `MONGODB_URI` in `.env` to a MongoDB Atlas connection string. When it is not configured, the server starts in foundation mode and reports that the database connection was skipped. No credentials are stored in the repository.

### AI service

```powershell
cd ai-service
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn main:app --reload --port 8000
```

## Environment Variables

- `frontend/.env.example`: `VITE_API_URL=http://localhost:5000/api`
- `backend/.env.example`: `PORT`, `MONGODB_URI`, `JWT_SECRET`, `FRONTEND_URL`, `AI_SERVICE_URL`, `JOB_SOURCE_CONFIG_JSON`, and `JOB_SYNC_ENABLED`
- `ai-service/.env.example`: `PORT=8000`

Real `.env` files are ignored by Git. Never expose MongoDB credentials or future secrets in frontend code.
The backend defaults `AI_SERVICE_URL` to `http://localhost:8000` for local development; configure it to the deployed AI service URL in the production backend environment.

## Official Job Sources

The backend supports public Greenhouse and Lever employer feeds through a separate, manually invoked sync command. No source is configured by default. Before adding a source, verify from the employer's official careers page that its Greenhouse board token or Lever site name belongs to that employer. The sync cannot independently prove that a configured board belongs to the configured company.

Set `JOB_SOURCE_CONFIG_JSON` in the backend environment to a JSON array of reviewed source configurations. Each entry uses:

```json
[
  {
    "provider": "greenhouse",
    "sourceCompany": "<employer name confirmed on its careers page>",
    "careersUrl": "<official HTTPS employer careers page>",
    "boardToken": "<board token confirmed from that page>"
  }
]
```

For Lever, use `"provider": "lever"` and `"siteName"` in place of `"boardToken"`. Do not use an unverified company/feed pairing. `JOB_SYNC_ENABLED` defaults to `false`; it must be explicitly set to `true` to permit writes.

Before using the database-connected sync, inspect public feeds with an explicitly supplied JSON file from `backend`. This file is only source configuration; it must not contain credentials:

```powershell
$sourceConfig = Join-Path $env:TEMP 'careerlens-netlify-sources.json'
@'
[
  {
    "provider": "greenhouse",
    "sourceCompany": "Netlify",
    "careersUrl": "https://www.netlify.com/careers/",
    "boardToken": "netlify",
    "excludeListingIds": ["4224129002"]
  }
]
'@ | Set-Content -Encoding utf8 $sourceConfig
npm.cmd run inspect:official-job-feeds -- --config-file "$sourceConfig"
```

This standalone inspection command does not load dotenv, read environment variables, connect to MongoDB, or write data. It reads only the explicitly supplied `.json` file, strips a PowerShell UTF-8 BOM, and reports included listings and any excluded IDs/titles. The Netlify Greenhouse source is restricted in code to reviewed role IDs `8806100002`, `8861222002`, `8823312002`, and `8859322002`; the talent-community ID `4224129002` and all other IDs are excluded.

Feed sync inserts new listings inactive and does not set source review, employer/college verification, or availability confirmation. To review one of the four staged Netlify roles, configure `JOB_REVIEW_API_TOKEN` and `JOB_REVIEW_API_REVIEWER` in the backend runtime environment. Keep the bearer token secret and limit it to authorized reviewers; the reviewer value is the attribution recorded with each decision. The review route is `POST /api/jobs/review/netlify/<sourceListingId>` and requires all three explicit JSON fields:

```json
{
  "decision": "approved",
  "availability": "available",
  "publish": false
}
```

An authorized reviewer must independently re-check the official careers page and the listing's application page before recording approval and current availability. `publish` must be explicitly `true` to activate that one listing; otherwise it is kept inactive. Rejections or unavailable decisions keep it inactive. These source-page review fields are separate from employer and college-placement-office verification. Public jobs also require a fresh availability confirmation and feed check (both within 24 hours); source-feed presence alone is not approval or a claim that the role is open. The review API is unavailable unless both runtime settings are configured.

The existing `npm run sync:official-jobs -- --dry-run` is **database-connected**: it loads dotenv and reads matching source records, although it does not write records or create indexes. Do not use it for a no-database inspection. Missing-listing deactivation is disabled by default. Set `"deactivateMissingListings": true` for a source only after independently establishing that its feed response is complete and intended as a full snapshot. The adapters validate HTTP success and feed shape but cannot detect every provider-side truncation. During apply, all configured feeds are fetched and validated before record writes; listings are upserted before any opted-in deactivation. A database error during individual upserts can leave partial refreshes, so retry only after reviewing status; default-off deactivation prevents an upsert failure from triggering removals. Opted-in deactivation is not transactional: a database failure during `updateMany` can leave reconciliation partially applied. The apply command requires `JOB_SYNC_ENABLED=true`. Duplicate protection is scoped to provider, configured company, and external listing ID. An empty feed with existing records fails closed unless `allowEmptyResult: true` is added after confirming the employer feed is intentionally empty.

Only fields supplied by a feed are mapped; absent posting dates, salary, location, job type, experience, expiry dates, and skills are not inferred. Application links are accepted only when their host and board/site path match the configured provider source. A successful live feed response is the sync's evidence for active status and the 24-hour availability filter; employer ownership still depends on the source configuration being manually verified. The sync validates all configured feeds before its first record write; if the database fails during apply, earlier writes may already have succeeded and should be reviewed before retrying.

## Health Checks

- Backend: `http://localhost:5000/api/health`
- AI service: `http://localhost:8000/health`

Both return a JSON object with `success: true` and a service-specific message.

## Roadmap

1. Foundation
2. Authentication
3. Student Profile
4. Resume Upload
5. Resume Parsing
6. AI Resume Analysis
7. Job Management
8. AI Job Matching
9. Job Recommendations
10. Skill Gap Analysis
11. Application Tracking
12. Student Dashboard
13. College/Admin Dashboard
14. Notifications & Advanced Features
15. Testing & Deployment

## Development Notes

Phase 1 is intentionally free of fake student records, fake jobs, fake predictions, authentication, and large machine-learning dependencies. Placeholder routes for `/features`, `/how-it-works`, `/colleges`, and `/about` clearly indicate that those workflows belong to later phases.
