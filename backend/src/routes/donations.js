import { Router } from "express";
import { query } from "../db.js";

const router = Router();

function isValidRecurring(value) {
  return ["one_time", "fortnightly", "monthly"].includes(value);
}

router.post("/", async (req, res) => {
  try {
    const {
      campaignSlug,
      amount,
      recurring,
      dedicationName,
      dedicationMessage,
      donorName,
      donorEmail,
      stripePaymentIntentId
    } = req.body;

    if (!campaignSlug || !donorName || !donorEmail) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!Number.isFinite(amount) || amount < 2) {
      return res.status(400).json({ error: "Amount must be at least 2" });
    }

    if (!isValidRecurring(recurring)) {
      return res.status(400).json({ error: "Invalid recurring option" });
    }

    const campaignResult = await query(
      "SELECT id FROM campaigns WHERE slug = $1 LIMIT 1",
      [campaignSlug]
    );

    let campaignId;

    if (campaignResult.rows.length === 0) {
      const insertCampaign = await query(
        "INSERT INTO campaigns (slug, title, description) VALUES ($1, $2, $3) RETURNING id",
        [
          campaignSlug,
          "Princes Court, Together",
          "Auto-created campaign record"
        ]
      );
      campaignId = insertCampaign.rows[0].id;
    } else {
      campaignId = campaignResult.rows[0].id;
    }

    const insertDonation = await query(
      `
      INSERT INTO donations (
        campaign_id,
        amount,
        recurring,
        dedication_name,
        dedication_message,
        donor_name,
        donor_email,
        stripe_payment_intent_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, amount, recurring, donor_name, donor_email, created_at
      `,
      [
        campaignId,
        amount,
        recurring,
        dedicationName || null,
        dedicationMessage || null,
        donorName,
        donorEmail,
        stripePaymentIntentId || null
      ]
    );

    return res.status(201).json({ data: insertDonation.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: "Could not create donation" });
  }
});

export default router;
