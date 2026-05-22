import https from "https";

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);
}


function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      { hostname, path, method: "POST", headers: { ...headers, "Content-Length": Buffer.byteLength(data) } },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${raw}`));
          else resolve(raw);
        });
      }
    );
    req.setTimeout(15000, () => req.destroy(new Error("Request timeout")));
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function sendEmail({ to, toName, subject, html, text }) {
  const fromEmail = process.env.FROM_EMAIL || "shahriyarhasib6@gmail.com";
  const auth = Buffer.from(`${process.env.MAILJET_API_KEY}:${process.env.MAILJET_SECRET_KEY}`).toString("base64");
  await httpsPost(
    "api.mailjet.com",
    "/v3.1/send",
    { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" },
    { Messages: [{ From: { Email: fromEmail, Name: "Princes Court Together" }, To: [{ Email: to, Name: toName }], Subject: subject, HTMLPart: html, TextPart: text }] }
  );
}

export async function sendDonationEmails({ donorName, donorEmail, amount, recurring, paymentIntentId, dedicationName }) {
  if (!process.env.MAILJET_API_KEY || !process.env.MAILJET_SECRET_KEY) {
    console.warn("[email] MAILJET keys not set — skipping.");
    return;
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const formattedAmount = formatCurrency(amount);
  const recurringMap = { one_time: "One time", weekly: "Weekly", monthly: "Monthly", annually: "Annually" };
  const recurringLabel = recurringMap[recurring] || "One time";

  const donorHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2E373B">
      <div style="background:#006F93;padding:24px 32px">
        <h1 style="color:#fff;margin:0;font-size:22px">Thank you for your donation!</h1>
      </div>
      <div style="padding:32px">
        <p>Dear ${donorName},</p>
        <p>Your generous donation to <strong>Princes Court, Together</strong> has been received. Every contribution helps build a legacy of care in Mildura.</p>
        <table style="width:100%;border-collapse:collapse;margin:24px 0">
          <tr style="background:#f4f4f4">
            <td style="padding:10px 16px;font-weight:bold">Description</td>
            <td style="padding:10px 16px;font-weight:bold">Amount</td>
          </tr>
          <tr>
            <td style="padding:10px 16px;border-bottom:1px solid #eee">${recurringLabel} donation</td>
            <td style="padding:10px 16px;border-bottom:1px solid #eee">${formattedAmount}</td>
          </tr>
          ${dedicationName ? `<tr><td style="padding:10px 16px;border-bottom:1px solid #eee">Dedicated to</td><td style="padding:10px 16px;border-bottom:1px solid #eee">${dedicationName}</td></tr>` : ""}
          <tr style="background:#EBFAFF">
            <td style="padding:10px 16px;font-weight:bold">Total AUD</td>
            <td style="padding:10px 16px;font-weight:bold">${formattedAmount}</td>
          </tr>
        </table>
        <p style="font-size:13px;color:#58686F">Payment reference: ${paymentIntentId}</p>
        <p style="font-size:13px;color:#58686F">All donations are tax-deductible. This email serves as your receipt.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="font-size:12px;color:#999">Princes Court, Together — Fundraising services provided by Shout for Good Pty Ltd ABN: 45 163 218 639</p>
      </div>
    </div>`;

  const adminHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2E373B">
      <div style="background:#006F93;padding:24px 32px">
        <h1 style="color:#fff;margin:0;font-size:22px">New Donation Received</h1>
      </div>
      <div style="padding:32px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 0;color:#58686F;width:160px">Donor</td><td style="padding:8px 0;font-weight:bold">${donorName}</td></tr>
          <tr><td style="padding:8px 0;color:#58686F">Email</td><td style="padding:8px 0">${donorEmail || "—"}</td></tr>
          <tr><td style="padding:8px 0;color:#58686F">Amount</td><td style="padding:8px 0;font-weight:bold">${formattedAmount} AUD</td></tr>
          <tr><td style="padding:8px 0;color:#58686F">Frequency</td><td style="padding:8px 0">${recurringLabel}</td></tr>
          ${dedicationName ? `<tr><td style="padding:8px 0;color:#58686F">Dedication</td><td style="padding:8px 0">${dedicationName}</td></tr>` : ""}
          <tr><td style="padding:8px 0;color:#58686F">Payment ID</td><td style="padding:8px 0;font-size:13px">${paymentIntentId}</td></tr>
        </table>
      </div>
    </div>`;

  const sends = [];

  if (donorEmail) {
    sends.push(
      sendEmail({
        to: donorEmail,
        toName: donorName,
        subject: "Thank you for your donation — Princes Court, Together",
        html: donorHtml,
        text: `Thank you ${donorName}! Your ${recurringLabel} donation of ${formattedAmount} AUD has been received. Payment reference: ${paymentIntentId}`
      }).catch(err => console.error("[email] Failed to send donor receipt:", err.message))
    );
  }

  if (adminEmail) {
    sends.push(
      sendEmail({
        to: adminEmail,
        toName: "Admin",
        subject: `New donation: ${formattedAmount} from ${donorName}`,
        html: adminHtml,
        text: `New donation.\nDonor: ${donorName}\nEmail: ${donorEmail || "—"}\nAmount: ${formattedAmount} AUD\nFrequency: ${recurringLabel}\nPayment ID: ${paymentIntentId}`
      }).catch(err => console.error("[email] Failed to send admin notification:", err.message))
    );
  }

  await Promise.all(sends);
  console.log(`[email] Notifications sent for payment ${paymentIntentId}`);
}
