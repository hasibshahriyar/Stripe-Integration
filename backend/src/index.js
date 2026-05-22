import "dotenv/config";
import cors from "cors";
import express from "express";
import adminRouter from "./routes/admin.js";
import campaignsRouter from "./routes/campaigns.js";
import donationsRouter from "./routes/donations.js";
import stripeRouter from "./routes/stripe.js";

const app = express();
const port = Number(process.env.PORT || 4000);

const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, "http://localhost:5173"]
  : true;

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/admin", adminRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/donations", donationsRouter);
app.use("/api/stripe", stripeRouter);

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
