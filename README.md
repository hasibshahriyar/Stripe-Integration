# StripeIntegration

Full-stack donation flow inspired by the provided page, built with:
- React + Vite frontend
- Express backend
- PostgreSQL database

## Project structure

- `frontend` - UI donation flow (amount -> dedication -> payment details)
- `backend` - REST API + PostgreSQL persistence

## 1) Configure PostgreSQL

Create a database named `donations_db` and run:

```sql
\i backend/sql/schema.sql
```

## 2) Backend setup

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Backend runs at `http://localhost:4000`.

## 3) Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` and proxies `/api` to backend.

## API endpoints

- `GET /api/health`
- `GET /api/campaigns/:slug`
- `POST /api/donations`

Example donation payload:

```json
{
  "campaignSlug": "princes-court-together",
  "amount": 100,
  "recurring": "one_time",
  "dedicationName": "In memory of A.",
  "dedicationMessage": "With love",
  "donorName": "Jane Doe",
  "donorEmail": "jane@example.com"
}
```
