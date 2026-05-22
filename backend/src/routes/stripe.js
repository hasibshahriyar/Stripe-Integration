import { Router } from "express";
import Stripe from "stripe";
import { sendDonationEmails } from "../services/email.js";

const router = Router();

router.post("/payment-intent", async (req, res) => {
  const { amount, donorName, donorEmail, recurring } = req.body;

  if (!Number.isFinite(amount) || amount < 2) {
    return res.status(400).json({ error: "Invalid amount. Minimum donation is $2.00." });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "Stripe is not configured on this server." });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // cents
      currency: "aud",
      receipt_email: donorEmail || undefined,
      metadata: {
        donorName: donorName || "",
        recurring: recurring || "one_time"
      }
    });

    return res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Could not create payment intent." });
  }
});

// Called by the frontend after stripe.confirmCardPayment succeeds
router.post("/notify", async (req, res) => {
  const { paymentIntentId, donorName, donorEmail, amount, recurring, dedicationName } = req.body;

  if (!paymentIntentId) {
    return res.status(400).json({ error: "paymentIntentId is required." });
  }

  // Verify the payment actually succeeded before sending emails
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" });
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (pi.status !== "succeeded") {
        return res.status(400).json({ error: "Payment has not succeeded." });
      }
    } catch (err) {
      return res.status(500).json({ error: "Could not verify payment." });
    }
  }

  // Send emails best-effort
  await sendDonationEmails({ donorName, donorEmail, amount, recurring, paymentIntentId, dedicationName });

  return res.json({ ok: true });
});

export default router;
