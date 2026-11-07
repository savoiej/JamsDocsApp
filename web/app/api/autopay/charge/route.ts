import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getViewer } from "@/lib/supabase/server";
import { invTotals, loadContract, loadInvoice, payConfigured, readPm, recordPayment, stripe } from "@/lib/stripe-pay";

// POST /api/autopay/charge {invoiceId}: charge a sent contract invoice to the contract's saved payment
// method. Office staff only (admins and users; never techs). The amount is the invoice's open balance
// on the server, and the idempotency key stops a double click from charging twice.
export async function POST(request: NextRequest) {
  const { userId, profile } = await getViewer();
  if (!userId || !profile?.active || profile.role === "tech") return NextResponse.json({ ok: false, message: "Not allowed." }, { status: 403 });
  if (!payConfigured()) return NextResponse.json({ ok: false, message: "Online payments aren't set up on this site yet." }, { status: 503 });
  const { invoiceId } = await request.json().catch(() => ({}));
  const inv = invoiceId ? await loadInvoice(String(invoiceId)) : null;
  if (!inv) return NextResponse.json({ ok: false, message: "That invoice isn't saved yet. Try again in a moment." }, { status: 404 });
  if (inv.void || !inv.sentAt) return NextResponse.json({ ok: false, message: "Only sent invoices can be charged." }, { status: 400 });
  const ct = inv.src?.ct ? await loadContract(inv.src.ct) : null;
  const pm = ct ? await readPm(ct.id) : null;
  if (!ct || !pm || pm.status !== "active") return NextResponse.json({ ok: false, message: "This contract has no saved payment method." }, { status: 400 });
  const { bal } = invTotals(inv);
  const cents = Math.round(bal * 100);
  if (cents < 50) return NextResponse.json({ ok: false, message: "Nothing left to pay on this invoice." }, { status: 400 });
  const meta = { app: "sitrep", kind: "autopay", invoice_id: inv.id, invoice_no: inv.no, contract_id: ct.id };
  const doc = (pi: Stripe.PaymentIntent, status: "paid" | "processing" | "failed", method: string) => ({
    sessionId: pi.id, invoiceId: inv.id, invoiceNo: inv.no, amount: cents / 100, status, method, pi: pi.id,
    date: new Date().toISOString().slice(0, 10), at: new Date().toISOString(),
  });
  try {
    const pi = await stripe().paymentIntents.create(
      { amount: cents, currency: "usd", customer: pm.customer, payment_method: pm.pm, off_session: true, confirm: true, description: `Invoice ${inv.no} · ${ct.no}`, metadata: meta },
      { idempotencyKey: `sitrep-autopay-${inv.id}-${cents}` },
    );
    const status = pi.status === "succeeded" ? "paid" : pi.status === "processing" ? "processing" : "failed";
    await recordPayment(doc(pi, status, `Autopay ${pm.label}`));
    return NextResponse.json({ ok: status !== "failed", status, message: status === "paid" ? "Paid." : status === "processing" ? "Bank payment processing." : `Not completed (${pi.status}).` });
  } catch (e) {
    const err = e as Stripe.errors.StripeError & { raw?: { payment_intent?: Stripe.PaymentIntent } };
    const pi = err.raw?.payment_intent;
    if (pi) await recordPayment(doc(pi, "failed", `Autopay ${pm.label}`)).catch(() => {});
    const msg = err.code === "authentication_required" ? "The card needs the client to approve this charge. Send them the invoice's pay link." : err.message || "The charge didn't go through.";
    return NextResponse.json({ ok: false, status: "failed", message: msg }, { status: 402 });
  }
}
