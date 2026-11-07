import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { pmLabel, recordPayment, stripe, writePm, type PayDoc } from "@/lib/stripe-pay";

// Stripe webhook: records invoice payments made through Checkout. Every event's signature is
// verified before anything is read. Card payments arrive paid on checkout.session.completed;
// ACH bank payments arrive unpaid ("processing") and settle days later with
// checkout.session.async_payment_succeeded or ..._failed. Autopay: a setup-mode session saves the
// contract's payment method; off-session charges settle with payment_intent.succeeded / ..._failed.
export const runtime = "nodejs";

const label = (pi: Stripe.PaymentIntent | null) => {
  const ch = pi && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const d = ch?.payment_method_details;
  if (!d) return "Online payment";
  if (d.type === "card" && d.card) return `Card ${d.card.brand ? d.card.brand.toUpperCase() + " " : ""}…${d.card.last4 || ""}`.trim();
  if (d.type === "us_bank_account" && d.us_bank_account) return `ACH bank transfer …${d.us_bank_account.last4 || ""}`;
  return d.type.replace(/_/g, " ");
};

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = request.headers.get("stripe-signature");
  if (!secret || !sig) return NextResponse.json({ error: "not configured" }, { status: 400 });
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, secret);
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  const kinds: Record<string, PayDoc["status"] | "auto"> = {
    "checkout.session.completed": "auto",
    "checkout.session.async_payment_succeeded": "paid",
    "checkout.session.async_payment_failed": "failed",
  };
  /* autopay: off-session charges made by /api/autopay/charge */
  if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    if (pi.metadata?.app !== "sitrep" || pi.metadata?.kind !== "autopay" || !pi.metadata.invoice_id) return NextResponse.json({ received: true });
    let full: Stripe.PaymentIntent | null = null;
    try { full = await stripe().paymentIntents.retrieve(pi.id, { expand: ["latest_charge"] }); } catch { full = null; }
    try {
      await recordPayment({ sessionId: pi.id, invoiceId: pi.metadata.invoice_id, invoiceNo: pi.metadata.invoice_no || "", amount: Math.round(pi.amount || 0) / 100,
        status: event.type === "payment_intent.succeeded" ? "paid" : "failed", method: `Autopay ${label(full)}`, pi: pi.id,
        date: new Date(event.created * 1000).toISOString().slice(0, 10), at: new Date().toISOString() });
    } catch (e) {
      console.error("record autopay", (e as Error).message);
      return NextResponse.json({ error: "could not record" }, { status: 500 });
    }
    return NextResponse.json({ received: true });
  }
  const kind = kinds[event.type];
  if (!kind) return NextResponse.json({ received: true });
  const s = event.data.object as Stripe.Checkout.Session;
  /* autopay setup: save the contract's payment method */
  if (s.mode === "setup") {
    if (s.metadata?.app !== "sitrep" || s.metadata?.kind !== "autopay" || !s.metadata.contract_id || event.type !== "checkout.session.completed") return NextResponse.json({ received: true });
    const siId = typeof s.setup_intent === "string" ? s.setup_intent : s.setup_intent?.id;
    try {
      const si = siId ? await stripe().setupIntents.retrieve(siId, { expand: ["payment_method"] }) : null;
      const pm = si && typeof si.payment_method === "object" ? si.payment_method : null;
      const customer = typeof s.customer === "string" ? s.customer : s.customer?.id || "";
      if (!pm || !customer) return NextResponse.json({ received: true });
      await writePm({ contractId: s.metadata.contract_id, customer, pm: pm.id, label: pmLabel(pm), status: "active", at: new Date().toISOString(), sessionId: s.id });
    } catch (e) {
      console.error("save autopay method", (e as Error).message);
      return NextResponse.json({ error: "could not record" }, { status: 500 });
    }
    return NextResponse.json({ received: true });
  }
  if (s.metadata?.app !== "sitrep" || !s.metadata?.invoice_id) return NextResponse.json({ received: true });

  const status: PayDoc["status"] = kind === "auto" ? (s.payment_status === "unpaid" ? "processing" : "paid") : kind;
  let pi: Stripe.PaymentIntent | null = null;
  const piId = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id || "";
  if (piId) {
    try {
      pi = await stripe().paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
    } catch {
      pi = null;
    }
  }
  const now = new Date();
  try {
    await recordPayment({
      sessionId: s.id,
      invoiceId: s.metadata.invoice_id,
      invoiceNo: s.metadata.invoice_no || "",
      amount: Math.round(s.amount_total || 0) / 100,
      status,
      method: label(pi),
      pi: piId,
      date: new Date((event.created || now.getTime() / 1000) * 1000).toISOString().slice(0, 10),
      at: now.toISOString(),
    });
  } catch (e) {
    // a non-2xx makes Stripe retry the event later
    console.error("record payment", (e as Error).message);
    return NextResponse.json({ error: "could not record" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
