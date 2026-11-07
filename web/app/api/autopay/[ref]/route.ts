import { type NextRequest, NextResponse } from "next/server";
import { AUTOPAY_INTEGRATION_ID, loadContractByRef, payConfigured, stripe } from "@/lib/stripe-pay";

// POST /api/autopay/<contractId>.<token> -> Checkout in setup mode: the client saves a card or US bank
// account (with an ACH mandate) so the contract's invoices can be charged automatically.
export async function POST(request: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const back = (q: string) => NextResponse.redirect(new URL(`/autopay/${encodeURIComponent(ref)}?${q}`, request.url), 303);
  if (!payConfigured()) return back("status=unavailable");
  const found = await loadContractByRef(ref).catch(() => null);
  if (!found || ["Cancelled", "Draft"].includes(String(found.c.status))) return back("status=notfound");
  const { c, email, firm, pm } = found;
  const origin = new URL(request.url).origin;
  const meta = { app: "sitrep", kind: "autopay", contract_id: c.id, contract_no: c.no };
  try {
    const customer = pm?.customer || (await stripe().customers.create({ name: c.client, ...(email ? { email } : {}), metadata: { app: "sitrep", contract_id: c.id, client: c.client } })).id;
    const cycle = String(c.cycle || "Monthly").toLowerCase();
    const session = await stripe().checkout.sessions.create({
      mode: "setup",
      currency: "usd",
      customer,
      metadata: meta,
      setup_intent_data: { metadata: meta, description: `${firm} · ${c.no} automatic payments` },
      custom_text: {
        submit: {
          message: `By saving, you authorize ${firm} to charge this payment method for invoices issued under service contract ${c.no}${c.title ? ` (${c.title})` : ""}, normally once each ${cycle === "annual" ? "year" : cycle === "quarterly" ? "quarter" : "month"}, for the amount shown on each invoice. You can cancel by contacting ${firm}${found.firmEmail ? ` at ${found.firmEmail}` : ""}.`.slice(0, 1200),
        },
      },
      success_url: `${origin}/autopay/${encodeURIComponent(ref)}?status=done`,
      cancel_url: `${origin}/autopay/${encodeURIComponent(ref)}`,
      integration_identifier: AUTOPAY_INTEGRATION_ID,
    });
    return session.url ? NextResponse.redirect(session.url, 303) : back("status=error");
  } catch (e) {
    console.error("autopay setup", (e as Error).message);
    return back("status=error");
  }
}
