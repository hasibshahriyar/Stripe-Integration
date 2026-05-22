export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = req.headers["x-proxy-secret"];
  if (!secret || secret !== process.env.EMAIL_PROXY_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { to, toName, subject, html, text } = req.body;
  if (!to || !subject) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const fromEmail = process.env.FROM_EMAIL || "shahriyarhasib6@gmail.com";
  const auth = Buffer.from(
    `${process.env.MAILJET_API_KEY}:${process.env.MAILJET_SECRET_KEY}`
  ).toString("base64");

  const mjRes = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Messages: [
        {
          From: { Email: fromEmail, Name: "Princes Court Together" },
          To: [{ Email: to, Name: toName || to }],
          Subject: subject,
          HTMLPart: html,
          TextPart: text || "",
        },
      ],
    }),
  });

  if (!mjRes.ok) {
    const err = await mjRes.text();
    return res.status(500).json({ error: err });
  }

  return res.status(200).json({ ok: true });
}
