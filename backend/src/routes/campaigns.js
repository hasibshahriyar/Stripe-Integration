import { Router } from "express";
import { query } from "../db.js";

const router = Router();

const fallbackCampaign = {
  slug: "princes-court-together",
  title: "Princes Court, Together",
  description:
    "Building the future of aged care in Mildura, together. Every contribution helps ensure this first-class facility opens complete from day one."
};

router.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const result = await query(
      "SELECT slug, title, description FROM campaigns WHERE slug = $1 LIMIT 1",
      [slug]
    );

    if (result.rows.length === 0 && slug === fallbackCampaign.slug) {
      return res.json({ data: fallbackCampaign });
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    return res.json({ data: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: "Could not fetch campaign" });
  }
});

export default router;
