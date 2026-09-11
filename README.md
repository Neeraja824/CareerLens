# CareerLens AI

**AI-Powered Resume Intelligence & Career Recommendation Platform**

CareerLens AI is a production-minded foundation for a college placement platform that helps students understand their resume, identify skill gaps, and move toward better-fit opportunities. Phase 1 establishes the frontend product experience and the backend and AI-service boundaries; future phases will add live intelligence and workflows.

## Problem and Objectives

Students often receive generic resume feedback while placement teams lack a clear view of readiness and recurring skill gaps. CareerLens AI is designed to connect resume intelligence, career direction, job matching, application tracking, and college placement analytics in one system.

Phase 1 delivers a responsive SaaS-style landing page, a React application shell, an Express API, a FastAPI AI-service shell, MongoDB Atlas configuration, safe environment templates, and health checks. It intentionally does not implement authentication, uploads, parsing, predictions, jobs, applications, or dashboards.

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
- `backend/.env.example`: `PORT`, `MONGODB_URI`, `JWT_SECRET`, and `FRONTEND_URL`
- `ai-service/.env.example`: `PORT=8000`

Real `.env` files are ignored by Git. Never expose MongoDB credentials or future secrets in frontend code.

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
