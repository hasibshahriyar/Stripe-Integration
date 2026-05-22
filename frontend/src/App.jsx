import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : null;

const API_BASE = import.meta.env.VITE_API_URL || "";

const PRESET_AMOUNTS = [10, 50, 100];
const DEFAULT_RECURRING = [
  { value: "one_time", label: "One time" },
  { value: "weekly",   label: "Weekly" },
  { value: "monthly",  label: "Monthly" },
  { value: "annually", label: "Annually" }
];

const LOGO_URL =
  "https://d26y0jrrsmsivl.cloudfront.net/button_logos/2438/Button-6unNFdGqlMzsn9qwX0IkS.png";
const BANNER_URL =
  "https://d26y0jrrsmsivl.cloudfront.net/button_banners/24343/ButtonBannerImageFile-RlyhptRAaawrWxYTjZmTU.png";

const initialForm = {
  amount: 10,
  customAmount: "",
  recurring: "one_time",
  // Dedication
  dedFirstName: "",
  dedLastName: "",
  dedMessage: "",
  dedNotify: false,
  notifyFirstName: "",
  notifyLastName: "",
  notifyEmail: "",
  // Payment / receipt
  paymentMethod: "card",
  receiptInMyName: true,
  companyName: "",
  donorFirstName: "",
  donorLastName: "",
  donorEmail: "",
  donorPhone: "",
  phoneCountry: "+61",
  getUpdates: false
};

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2
  }).format(amount);
}

const CARD_STYLE = {
  style: {
    base: {
      fontSize: "16px",
      color: "#2E373B",
      fontFamily: '"Nunito Sans", -apple-system, sans-serif',
      fontWeight: "300",
      "::placeholder": { color: "#58686F" }
    },
    invalid: { color: "#c0392b" }
  }
};

export default function App() {
  if (window.location.pathname === "/admin") return <AdminPage />;
  return (
    <Elements stripe={stripePromise}>
      <DonationPage />
    </Elements>
  );
}

function DonationPage() {
  const stripe = useStripe();
  const elements = useElements();

  const [campaign, setCampaign] = useState(null);
  const [presetAmounts, setPresetAmounts] = useState(PRESET_AMOUNTS);
  const [recurringOptions, setRecurringOptions] = useState(DEFAULT_RECURRING);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [cardNumComplete, setCardNumComplete] = useState(false);
  const [cardExpComplete, setCardExpComplete] = useState(false);
  const [cardCvcComplete, setCardCvcComplete] = useState(false);
  const cardComplete = cardNumComplete && cardExpComplete && cardCvcComplete;

  useEffect(() => {
    fetch(`${API_BASE}/api/campaigns/princes-court-together`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setCampaign(d.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/admin/settings`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.presetAmounts?.length) setPresetAmounts(d.presetAmounts);
        if (d?.recurringOptions?.length) setRecurringOptions(d.recurringOptions);
      })
      .catch(() => {});
  }, []);

  const selectedAmount = useMemo(() => {
    const n = form.customAmount !== "" ? parseFloat(form.customAmount) : Number(form.amount);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [form.amount, form.customAmount]);

  const isStep1Valid = selectedAmount >= 2;

  function pickPreset(amount) {
    setForm((p) => ({ ...p, amount, customAmount: "" }));
  }

  function onCustomChange(e) {
    setForm((p) => ({ ...p, customAmount: e.target.value }));
  }

  function goNext() {
    setErrorMessage("");
    if (step === 1 && !isStep1Valid) {
      setErrorMessage("Minimum donation amount is $2.00.");
      return;
    }
    setStep((s) => Math.min(s + 1, 3));
  }

  function goToStep(n) {
    if (n < step) {
      setErrorMessage("");
      setStep(n);
    }
  }

  async function submitDonation(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setErrorMessage("");

    try {
      const donorName = `${form.donorFirstName} ${form.donorLastName}`.trim();

      // 1. Create PaymentIntent on the backend
      const piRes = await fetch(`${API_BASE}/api/stripe/payment-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: selectedAmount,
          donorName,
          donorEmail: form.donorEmail,
          recurring: form.recurring
        })
      });
      const piPayload = await piRes.json();
      if (!piRes.ok) throw new Error(piPayload.error || "Could not initiate payment");

      // 2. Confirm card payment with Stripe
      const cardElement = elements.getElement(CardNumberElement);
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
        piPayload.clientSecret,
        {
          payment_method: {
            card: cardElement,
            billing_details: { name: donorName, email: form.donorEmail }
          }
        }
      );
      if (stripeError) throw new Error(stripeError.message);

      // 3. Record donation in DB (best-effort — payment already confirmed above)
      fetch(`${API_BASE}/api/donations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignSlug: "princes-court-together",
          amount: selectedAmount,
          recurring: form.recurring,
          dedicationName: form.dedFirstName ? `${form.dedFirstName} ${form.dedLastName}`.trim() : null,
          dedicationMessage: form.dedMessage || null,
          donorName,
          donorEmail: form.donorEmail,
          stripePaymentIntentId: paymentIntent.id
        })
      }).catch(() => {});

      // 4. Send email notifications (best-effort)
      fetch(`${API_BASE}/api/stripe/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentIntentId: paymentIntent.id,
          donorName,
          donorEmail: form.donorEmail,
          amount: selectedAmount,
          recurring: form.recurring,
          dedicationName: form.dedFirstName ? `${form.dedFirstName} ${form.dedLastName}`.trim() : null
        })
      }).catch(() => {});

      setSuccessMessage(
        `Thank you, ${donorName}! Your donation of ${formatCurrency(selectedAmount)} was successful.`
      );
      setForm(initialForm);
      setStep(1);
    } catch (err) {
      setErrorMessage(err.message || "Could not complete donation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const campaignTitle = campaign?.title || "Princes Court, Together";
  const campaignDesc =
    campaign?.description || "Building the future of aged care in Mildura, together.";

  return (
    <div className="page">
      <div className="page-container">
      {/* Banner */}
      <div className="banner">
        <img src={BANNER_URL} alt="Princes Court — Together, building the future of aged care" />
      </div>

      {/* White card body */}
      <div className="body-card">
        <div className="form-layout">

          {/* ── Left: info panel ── */}
          <aside className="info-panel">
            <div
              className="logo-circle"
              style={{ backgroundImage: `url(${LOGO_URL})` }}
              role="img"
              aria-label="Princes Court Together logo"
            />
            <h3 className="campaign-name">{campaignTitle}</h3>
            <div className="teal-rule" />
            <div className="campaign-body">
              <p><strong>{campaignDesc}</strong></p>
              <p>
                You're supporting something meaningful. Princes Court is creating a new 50-bed
                residential aged care home designed to deliver care, dignity, and connection from
                day one.
              </p>
              <ul>
                <li>All donations are tax-deductible and welcome – from $2 up to $200,000+</li>
                <li>
                  Donate $20,000 or more to secure naming rights for a room, or $125,000 for a
                  household, with a commemorative plaque and public recognition (non‑exclusive)
                </li>
                <li>
                  Every contribution helps ensure this first-class facility is complete right
                  from the start
                </li>
              </ul>
              <p>
                <strong>
                  Every dollar counts – from $2 to $200,000+, your contribution helps us open the
                  doors of this much-needed home.
                </strong>
              </p>
              <p>Thank you for helping build a legacy of care, together.</p>
            </div>
          </aside>

          {/* ── Right: checkout panels ── */}
          <div className="checkout-panel">

            {successMessage && (
              <div className="alert alert--success">{successMessage}</div>
            )}

            {/* Section 1 — Make a donation */}
            <div className={`section-box ${step === 1 ? "is-opening" : ""}`}>
              <div className="section-box__head">
                <h4 className="title-label">Make a donation</h4>
                {step > 1 && (
                  <button type="button" className="edit-link" onClick={() => goToStep(1)}>
                    Edit
                  </button>
                )}
              </div>
              {step > 1 && (
                <p className="section-summary">
                  {recurringOptions.find((o) => o.value === form.recurring)?.label || form.recurring} donation &middot; {formatCurrency(selectedAmount)}
                </p>
              )}
              {step === 1 && (
                <>
                  {errorMessage && <p className="alert alert--error">{errorMessage}</p>}

                  {/* Amount pills */}
                  <div className="radio-group">
                    {presetAmounts.map((a) => (
                      <div
                        key={a}
                        className={`radio-button${form.customAmount === "" && form.amount === a ? " selected" : ""}`}
                        onClick={() => pickPreset(a)}
                      >
                        <label>
                          <input
                            type="radio"
                            name="amountGroup"
                            value={a}
                            checked={form.customAmount === "" && form.amount === a}
                            onChange={() => pickPreset(a)}
                          />
                          <div className="theme-active">
                            <span>{formatCurrency(a)}</span>
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>

                  {/* Custom amount with $ prefix */}
                  <div className="float-field float-field--prefix">
                    <span className="field-prefix">$</span>
                    <input
                      id="customAmount"
                      type="number"
                      min="2"
                      step="any"
                      value={form.customAmount}
                      onChange={onCustomChange}
                      placeholder=" "
                    />
                    <label htmlFor="customAmount">Enter a custom amount</label>
                  </div>

                  {/* Recurring */}
                  <p className="recurring-label">Would you like to make this recurring?</p>
                  <div className="radio-group radio-group--recurring">
                    {recurringOptions.map((opt) => (
                      <div
                        key={opt.value}
                        className={`radio-button${form.recurring === opt.value ? " selected" : ""}`}
                        onClick={() => setForm((p) => ({ ...p, recurring: opt.value }))}
                      >
                        <label>
                          <input
                            type="radio"
                            name="recurringGroup"
                            value={opt.value}
                            checked={form.recurring === opt.value}
                            onChange={() => setForm((p) => ({ ...p, recurring: opt.value }))}
                          />
                          <div className="theme-active">
                            <span>{opt.label}</span>
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className={`btn-next${isStep1Valid ? " btn-next--active" : ""}`}
                    disabled={!isStep1Valid}
                    onClick={goNext}
                  >
                    NEXT STEP
                  </button>
                </>
              )}
            </div>

            {/* Section 2 — Dedication */}
            <div className={`section-box ${step === 2 ? "is-opening" : ""}`}>
              <div className="section-box__head">
                <h4 className="title-label">Dedication</h4>
                {step > 2 && (
                  <button type="button" className="edit-link" onClick={() => goToStep(2)}>Edit</button>
                )}
              </div>
              {step > 2 && (form.dedFirstName || form.dedLastName) && (
                <p className="section-summary">{form.dedFirstName} {form.dedLastName}</p>
              )}
              {step === 2 && (
                <>
                  <p className="section-subtitle">Dedicate my donation in honor, memory, or support of someone.</p>

                  <div className="field-row">
                    <div className="float-field">
                      <input id="dedFirstName" type="text" value={form.dedFirstName}
                        onChange={(e) => setForm((p) => ({ ...p, dedFirstName: e.target.value }))}
                        placeholder=" " />
                      <label htmlFor="dedFirstName">First Name</label>
                    </div>
                    <div className="float-field">
                      <input id="dedLastName" type="text" value={form.dedLastName}
                        onChange={(e) => setForm((p) => ({ ...p, dedLastName: e.target.value }))}
                        placeholder=" " />
                      <label htmlFor="dedLastName">Last Name</label>
                    </div>
                  </div>

                  <div className="check-field">
                    <label>
                      <input type="checkbox" checked={form.dedNotify}
                        onChange={(e) => setForm((p) => ({ ...p, dedNotify: e.target.checked }))} />
                      <span>Notify someone of my dedication</span>
                    </label>
                  </div>

                  {form.dedNotify && (
                    <>
                      <div className="field-row">
                        <div className="float-field">
                          <input id="notifyFirstName" type="text" value={form.notifyFirstName}
                            onChange={(e) => setForm((p) => ({ ...p, notifyFirstName: e.target.value }))}
                            placeholder=" " />
                          <label htmlFor="notifyFirstName">First Name</label>
                        </div>
                        <div className="float-field">
                          <input id="notifyLastName" type="text" value={form.notifyLastName}
                            onChange={(e) => setForm((p) => ({ ...p, notifyLastName: e.target.value }))}
                            placeholder=" " />
                          <label htmlFor="notifyLastName">Last Name</label>
                        </div>
                      </div>
                      <div className="float-field">
                        <input id="notifyEmail" type="email" value={form.notifyEmail}
                          onChange={(e) => setForm((p) => ({ ...p, notifyEmail: e.target.value }))}
                          placeholder=" " />
                        <label htmlFor="notifyEmail">Email Address</label>
                      </div>
                    </>
                  )}

                  <div className="ded-actions">
                    <button type="button" className="btn-next btn-next--active" onClick={goNext}>
                      Next step
                    </button>
                    <button type="button" className="btn-skip" onClick={goNext}>
                      Skip this step
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Section 3 — Payment options */}
            <div className={`section-box ${step === 3 ? "is-opening" : ""}`}>
              <div className="section-box__head">
                <h4 className="title-label">Payment options</h4>
                {step > 3 && (
                  <button type="button" className="edit-link" onClick={() => goToStep(3)}>Edit</button>
                )}
              </div>
              {step === 3 && (
                <form onSubmit={submitDonation}>
                  {errorMessage && <p className="alert alert--error">{errorMessage}</p>}

                  {/* Payment method — vertical radio cards */}
                  <p className="subsection-label">Payment method</p>
                  <div className="pay-method-list">
                    {[
                      { id: "googlepay", label: "Google Pay" },
                      { id: "card",      label: "Credit Card" },
                      { id: "paypal",    label: "PayPal" }
                    ].map((m) => (
                      <label key={m.id} className={`pay-method-card${form.paymentMethod === m.id ? " selected" : ""}`}>
                        <input type="radio" name="paymentMethod" value={m.id}
                          checked={form.paymentMethod === m.id}
                          onChange={() => setForm((p) => ({ ...p, paymentMethod: m.id }))} />
                        <span className="pay-method-card__radio">
                          {form.paymentMethod === m.id && <span className="pay-method-card__dot" />}
                        </span>
                        <span className={`pay-method-icon pay-method-icon--${m.id}`} aria-hidden="true" />
                        <span className="pay-method-card__label">{m.label}</span>
                      </label>
                    ))}
                  </div>
                  {form.paymentMethod !== "card" && (
                    <p className="pay-method-notice">This payment method is not available in test mode. Please use Credit Card.</p>
                  )}

                  {/* Payment details */}
                  <p className="subsection-label">Payment details</p>
                  <div className="float-field">
                    <input id="companyName" type="text" value={form.companyName}
                      onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
                      placeholder=" " />
                    <label htmlFor="companyName">Company Name (Optional)</label>
                  </div>
                  <div className="field-row">
                    <div className="float-field">
                      <input id="donorFirstName" type="text" required value={form.donorFirstName}
                        onChange={(e) => setForm((p) => ({ ...p, donorFirstName: e.target.value }))}
                        placeholder=" " />
                      <label htmlFor="donorFirstName">First Name</label>
                    </div>
                    <div className="float-field">
                      <input id="donorLastName" type="text" required value={form.donorLastName}
                        onChange={(e) => setForm((p) => ({ ...p, donorLastName: e.target.value }))}
                        placeholder=" " />
                      <label htmlFor="donorLastName">Last Name</label>
                    </div>
                  </div>
                  <div className="float-field">
                    <input id="donorEmail" type="email" required value={form.donorEmail}
                      onChange={(e) => setForm((p) => ({ ...p, donorEmail: e.target.value }))}
                      placeholder=" " />
                    <label htmlFor="donorEmail">Email Address</label>
                  </div>
                  <div className="phone-field-wrap">
                    <select
                      className="phone-country-select"
                      value={form.phoneCountry || "+61"}
                      onChange={(e) => setForm((p) => ({ ...p, phoneCountry: e.target.value }))}
                      aria-label="Country code"
                    >
                      <option value="+61">+61</option>
                      <option value="+64">+64</option>
                    </select>
                    <input
                      id="donorPhone"
                      className="phone-number-input"
                      type="tel"
                      value={form.donorPhone}
                      onChange={(e) => setForm((p) => ({ ...p, donorPhone: e.target.value }))}
                      placeholder="Phone No. (Optional)"
                    />
                  </div>
                  <div className="check-field">
                    <label>
                      <input type="checkbox" checked={form.receiptInMyName}
                        onChange={(e) => setForm((p) => ({ ...p, receiptInMyName: e.target.checked }))} />
                      <span>Issue receipt in my name and details entered above.</span>
                    </label>
                  </div>

                  {/* Card details */}
                  {form.paymentMethod === "card" && (
                    <>
                      <div className="card-details-header">
                        <p className="subsection-label">Card details</p>
                        <div className="card-brand-icons">
                          <span className="card-brand card-brand--visa">VISA</span>
                          <span className="card-brand card-brand--mc" aria-label="Mastercard" />
                          <span className="card-brand card-brand--amex">AMEX</span>
                        </div>
                      </div>
                      <div className="stripe-split-row">
                        <div className="stripe-field-wrap stripe-field-wrap--num">
                          <CardNumberElement options={{ ...CARD_STYLE, placeholder: "Credit Card Number" }}
                            onChange={(e) => setCardNumComplete(e.complete)} />
                        </div>
                        <div className="stripe-field-wrap stripe-field-wrap--exp">
                          <CardExpiryElement options={{ ...CARD_STYLE, placeholder: "Expiry" }}
                            onChange={(e) => setCardExpComplete(e.complete)} />
                        </div>
                        <div className="stripe-field-wrap stripe-field-wrap--cvc">
                          <CardCvcElement options={{ ...CARD_STYLE, placeholder: "CCV" }}
                            onChange={(e) => setCardCvcComplete(e.complete)} />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Additional information */}
                  <p className="subsection-label">Additional information</p>
                  <div className="check-field">
                    <label>
                      <input type="checkbox" checked={form.getUpdates}
                        onChange={(e) => setForm((p) => ({ ...p, getUpdates: e.target.checked }))} />
                      <span>Get updates from Princes Court Ltd - you can opt out at any time</span>
                    </label>
                  </div>

                  {/* Order summary */}
                  <div className="order-summary">
                    <div className="order-summary__row order-summary__head">
                      <span>Description</span><span>Amount</span>
                    </div>
                    <div className="order-summary__row">
                      <span>{recurringOptions.find((o) => o.value === form.recurring)?.label || form.recurring} donation</span>
                      <span>{formatCurrency(selectedAmount)}</span>
                    </div>
                    <div className="order-summary__row">
                      <span>Subtotal</span><span>{formatCurrency(selectedAmount)}</span>
                    </div>
                    <div className="order-summary__row order-summary__total">
                      <span>Total</span><span>AUD {formatCurrency(selectedAmount)}</span>
                    </div>
                  </div>

                  {/* Merchant notice */}
                  <div className="merchant-notice">
                    <span className="merchant-notice__icon">⚠</span>
                    <p className="merchant-notice__text">Please note this transaction is processed by Shout For Good which will appear as the merchant on your statement.</p>
                  </div>

                  {/* Legal */}
                  <p className="pay-legal">
                    By completing your payment, you are agreeing to the{" "}
                    <a href="#" className="pay-link">Terms</a> and{" "}
                    <a href="#" className="pay-link">Privacy Policy</a>. This site is
                    protected by Cloudflare and the Cloudflare{" "}
                    <a href="#" className="pay-link">Privacy Policy</a> and{" "}
                    <a href="#" className="pay-link">Terms of Service</a> apply.
                  </p>

                  <button type="submit"
                    className={`btn-donate-now${form.donorFirstName && form.donorLastName && form.donorEmail && (form.paymentMethod !== "card" || cardComplete) && !submitting ? " active" : ""}`}
                    disabled={submitting || (form.paymentMethod === "card" && !stripe)}>
                    {submitting ? "Processing…" : "DONATE NOW"}
                  </button>
                  <button type="button" className="btn-back-inline" onClick={() => goToStep(2)}>← Back</button>
                </form>
              )}
            </div>

          </div>
        </div>

        {/* Footer */}
        <footer className="page-footer">
          <p>
            Shout fundraising services are provided by Shout for Good Pty Ltd (Shout) ABN:
            45 163 218 639. Our donation forms provide secure donations between donor and charities.
            Shout is part of the ANZ Group but is not a bank. Obligations of Shout are not deposits
            or liabilities of ANZ. ANZ does not stand behind or guarantee Shout or its obligations.
          </p>
          <p>Copyright © 2026</p>
          <p><a href="/admin" className="admin-page-link">⚙ Admin</a></p>
        </footer>
      </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Admin Page
───────────────────────────────────────────── */
function AdminPage() {
  const [amounts, setAmounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/api/admin/settings`)
      .then((r) => r.json())
      .then((d) => { setAmounts(d.presetAmounts || [10, 50, 100]); setLoading(false); })
      .catch(() => { setAmounts([10, 50, 100]); setLoading(false); });
  }, []);

  function updateAmount(i, v) { setAmounts((p) => p.map((a, j) => j === i ? v : a)); setSaved(false); }
  function addAmount() { setAmounts((p) => [...p, ""]); setSaved(false); }
  function removeAmount(i) { if (amounts.length > 1) { setAmounts((p) => p.filter((_, j) => j !== i)); setSaved(false); } }

  async function save() {
    setError("");
    const parsed = amounts.map(Number).filter((a) => Number.isFinite(a) && a >= 1);
    if (parsed.length === 0) { setError("At least one valid amount (≥ $1) is required."); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetAmounts: parsed })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setAmounts(data.presetAmounts);
      setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="admin-loading">Loading…</div>;

  return (
    <div className="admin-page">
      <div className="admin-card">
        <div className="admin-header">
          <h1 className="admin-title">Admin Panel</h1>
          <p className="admin-subtitle">Princes Court Together — Donation Settings</p>
        </div>

        {/* Preset Amounts */}
        <section className="admin-section">
          <h2 className="admin-section-title">Preset Donation Amounts</h2>
          <p className="admin-section-desc">These appear as quick-select buttons on the donation form.</p>
          <div className="admin-amounts">
            {amounts.map((a, i) => (
              <div key={i} className="admin-amount-row">
                <span className="admin-amount-prefix">$</span>
                <input type="number" min="1" step="any" className="admin-amount-input"
                  value={a} onChange={(e) => updateAmount(i, e.target.value)} />
                <button type="button" className="admin-btn-remove" title="Remove"
                  onClick={() => removeAmount(i)} disabled={amounts.length <= 1}>✕</button>
              </div>
            ))}
          </div>
          <button type="button" className="admin-btn-add" onClick={addAmount}>+ Add Amount</button>
        </section>

        {/* Recurring info — read-only */}
        <section className="admin-section">
          <h2 className="admin-section-title">Recurring Frequency</h2>
          <p className="admin-section-desc">Donors choose from these options in Step 1 of the form:</p>
          <ul className="admin-recurring-list">
            {DEFAULT_RECURRING.map((o) => (
              <li key={o.value}>
                <span className="admin-recurring-badge">{o.label}</span>
              </li>
            ))}
          </ul>
          <p className="admin-info-note">✓ Recurring is active — the selected frequency is recorded in the donation and sent to Stripe as metadata.</p>
        </section>

        {error && <p className="admin-error">{error}</p>}

        <div className="admin-actions">
          <button type="button"
            className={`admin-btn-save${saving ? "" : " admin-btn-save--ready"}`}
            onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
          {saved && <span className="admin-saved">✓ Saved!</span>}
        </div>

        <a href="/" className="admin-back-link">← Back to donation page</a>
      </div>
    </div>
  );
}
