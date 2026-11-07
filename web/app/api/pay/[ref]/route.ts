import { type NextRequest, NextResponse } from "next/server";
import { INTEGRATION_ID, loadByRef, payConfigured, stripe } from "@/lib/stripe-pay";

// POST /api/pay/<invoiceId>.<token> -> a Stripe Checkout Session for the invoice's open balance, then a redirect to it.
// The amount always comes from the saved invoice, never from the request.
export async function POST(request: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const back = (q: string) => NextResponse.redirect(new URL(`/pay/${encodeURIComponent(ref)}?${q}`, request.url), 303);
  if (!payConfigured()) return back("status=unavailable");
  const found = await loadByRef(ref).catch(() => null);
  if (!found) return back("status=notfound");
  const { inv, totals, email, firm } = found;
  if (inv.void || !inv.sentAt) return back("status=notfound");
  if (totals.bal <= 0.005) return back("status=paid");
  if (found.pending.length) return back("status=processing");
  const cents = Math.round(totals.bal * 100);
  if (cents < 50) return back("status=paid");
  const origin = new URL(request.url).origin;
  const meta = { app: "sitrep", invoice_id: inv.id, invoice_no: inv.no };
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: cents,
            product_data: { name: `Invoice ${inv.no}`, description: [firm, inv.project].filter(Boolean).join(" · ").slice(0, 500) || undefined },
          },
        },
      ],
      ...(email ? { customer_email: email } : {}),
      client_reference_id: inv.id,
      metadata: meta,
      payment_intent_data: { metadata: meta, description: `${firm} invoice ${inv.no}` },
      success_url: `${origin}/pay/${encodeURIComponent(ref)}?status=done`,
      cancel_url: `${origin}/pay/${encodeURIComponent(ref)}`,
      integration_identifier: INTEGRATION_ID,
    });
    if (!session.url) return back("status=error");
    return NextResponse.redirect(session.url, 303);
  } catch (e) {
    console.error("checkout session", (e as Error).message);
    return back("status=error");
  }
}
