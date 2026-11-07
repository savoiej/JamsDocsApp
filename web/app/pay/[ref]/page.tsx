import type { Metadata } from "next";
import { loadByRef, payConfigured } from "@/lib/stripe-pay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pay invoice · Jams Docs and Designs", robots: { index: false, follow: false } };

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const day = (d?: string) => (d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "");

const NOTES: Record<string, string> = {
  done: "Thank you. Your payment went through. Card payments show as paid right away; bank (ACH) payments can take a few business days to clear.",
  processing: "A bank (ACH) payment on this invoice is already processing. It usually clears in a few business days.",
  paid: "This invoice is paid in full. Thank you.",
  error: "We couldn’t start the payment just now. Please try again in a minute.",
  unavailable: "Online payment isn’t available right now. Please contact us to pay this invoice.",
  notfound: "This payment link isn’t valid. Please use the link from your most recent invoice.",
};

export default async function PayPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ status?: string }> }) {
  const { ref } = await params;
  const { status } = await searchParams;
  const found = payConfigured() ? await loadByRef(ref).catch(() => null) : null;
  const ok = found && !found.inv.void && found.inv.sentAt;
  const note = status && NOTES[status] ? NOTES[status] : !payConfigured() ? NOTES.unavailable : !ok ? NOTES.notfound : "";
  return (
    <main className="auth">
      <div className="auth-main" style={{ gridColumn: "1 / -1" }}>
        <div className="auth-card" style={{ maxWidth: 460 }}>
          <p className="muted" style={{ margin: 0, fontSize: 13, letterSpacing: ".04em", textTransform: "uppercase" }}>{ok ? found.firm : "Jams Docs and Designs"}</p>
          {ok ? (
            <>
              <h2 style={{ margin: "6px 0 2px" }}>Invoice {found.inv.no}</h2>
              <p className="muted" style={{ margin: 0 }}>
                {found.client?.name}
                {found.inv.project ? ` · ${found.inv.project}` : ""}
              </p>
              <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", margin: "18px 0" }}>
                <dt className="muted">Issued</dt><dd style={{ margin: 0, textAlign: "right" }}>{day(found.inv.issued)}</dd>
                {found.inv.due && (<><dt className="muted">Due</dt><dd style={{ margin: 0, textAlign: "right" }}>{day(found.inv.due)}</dd></>)}
                <dt className="muted">Invoice total</dt><dd style={{ margin: 0, textAlign: "right" }}>{usd(found.totals.total)}</dd>
                {found.totals.paid > 0 && (<><dt className="muted">Paid so far</dt><dd style={{ margin: 0, textAlign: "right" }}>{usd(found.totals.paid)}</dd></>)}
                <dt><b>Balance due</b></dt><dd style={{ margin: 0, textAlign: "right" }}><b>{usd(Math.max(0, found.totals.bal))}</b></dd>
              </dl>
              {note && <div className="msg" style={{ marginBottom: 14 }}>{note}</div>}
              {found.totals.bal > 0.005 && !found.pending.length && status !== "done" && (
                <form action={`/api/pay/${encodeURIComponent(ref)}`} method="post">
                  <button className="btn primary" style={{ width: "100%" }}>Pay {usd(found.totals.bal)}</button>
                  <p className="muted" style={{ fontSize: 13, margin: "10px 0 0" }}>Pay by card or US bank account (ACH) on Stripe’s secure checkout. Bank payments keep processing fees low on larger invoices.</p>
                </form>
              )}
              {found.firmEmail && <p className="muted" style={{ fontSize: 13, margin: "16px 0 0" }}>Questions about this invoice? Email {found.firmEmail}.</p>}
            </>
          ) : (
            <>
              <h2 style={{ margin: "6px 0 10px" }}>Pay an invoice</h2>
              <div className="msg">{note}</div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
