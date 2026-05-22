# Stripe Integration — Donation App

Full-stack donation flow for **Princes Court Together**, built with React + Vite (frontend) and Express (backend).

**No database required.** Stripe payments and email notifications work out of the box.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite 5, @stripe/react-stripe-js |
| Backend | Node.js, Express 4, ESM modules |
| Payments | Stripe (split card fields — number / expiry / CVC) |
| Email | Nodemailer (Gmail SMTP) |
| Admin | `/admin` route — no auth, edit preset amounts |
| Deploy | Vercel (frontend) + Render (backend) |

---

## Local Development

### 1. Backend

```bash
cd backend
cp .env.example .env   # fill in your keys
npm install
npm start
```

Runs at `http://localhost:4000`.

### 2. Frontend

```bash
cd frontend
cp .env.example .env   # VITE_API_URL can stay empty for local dev
npm install
npm run dev
```

Runs at `http://localhost:5173`. The Vite dev proxy forwards `/api` → `localhost:4000` automatically.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `PORT` | Server port (default `4000`) |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_…` or `sk_live_…`) |
| `SMTP_HOST` | SMTP host (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | SMTP port (e.g. `587`) |
| `SMTP_SECURE` | `false` for STARTTLS, `true` for SSL |
| `SMTP_USER` | Gmail address |
| `SMTP_PASS` | Gmail app password |
| `FROM_EMAIL` | Sender address |
| `ADMIN_EMAIL` | Admin notification recipient |
| `FRONTEND_URL` | Your Vercel URL — e.g. `https://your-app.vercel.app` |

### Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_test_…` or `pk_live_…`) |
| `VITE_API_URL` | Render backend URL — e.g. `https://your-backend.onrender.com` (empty for local dev) |

---

## Deploy to Render (Backend)

1. Go to [render.com](https://render.com) → **New → Web Service**
2. Connect your GitHub repo: `hasibshahriyar/Stripe-Integration`
3. Set:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Add all environment variables from the table above under **Environment**
5. Set `FRONTEND_URL` to your Vercel URL (you can update this after deploying the frontend)
6. Click **Deploy** — note the URL: `https://your-backend.onrender.com`

---

## Deploy to Vercel (Frontend)

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repo: `hasibshahriyar/Stripe-Integration`
3. Set:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite
4. Add environment variables:
   - `VITE_STRIPE_PUBLISHABLE_KEY` = your Stripe publishable key
   - `VITE_API_URL` = your Render backend URL (e.g. `https://your-backend.onrender.com`)
5. Click **Deploy** — note the URL: `https://your-app.vercel.app`
6. Go back to Render → update `FRONTEND_URL` to this Vercel URL → **Manual Deploy**

---

## Admin Panel

Visit `/admin` on your deployed frontend to edit preset donation amounts.  
Recurring frequency options (One time / Weekly / Monthly / Annually) are fixed in code.

> **Note:** Render's free tier has an ephemeral filesystem. Admin changes to preset amounts reset on redeploy. Re-save in `/admin` after each backend deploy.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/campaigns/:slug` | Campaign info |
| `POST` | `/api/stripe/payment-intent` | Create Stripe PaymentIntent |
| `POST` | `/api/stripe/notify` | Send email notifications |
| `POST` | `/api/donations` | Record donation (no-op if DB not set up) |
| `GET` | `/api/admin/settings` | Get preset amounts |
| `POST` | `/api/admin/settings` | Update preset amounts |

