import type { Metadata } from "next";
import { loadContractByRef, payConfigured } from "@/lib/stripe-pay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Automatic payments · Jams Docs and Designs", robots: { index: false, follow: false } };

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const NOTES: Record<string, string> = {
  done: "Thank you. Your payment method is saved. Invoices under this agreement will be charged to it automatically, and you'll still receive each invoice.",
  error: "We couldn’t start the setup just now. Please try again in a minute.",
  unavailable: "Automatic payments aren’t available right now. Please contact us.",
  notfound: "This link isn’t valid. Please use the most recent link we sent you.",
};

export default async function AutopayPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ status?: string }> }) {
  const { ref } = await params;
  const { status } = await searchParams;
  const f = payConfigured() ? await loadContractByRef(ref).catch(() => null) : null;
  const ok = f && !["Cancelled", "Draft"].includes(String(f.c.status));
  const note = status && NOTES[status] ? NOTES[status] : !payConfigured() ? NOTES.unavailable : !ok ? NOTES.notfound : "";
  const fee = ok && +String(f.c.fee || 0) > 0 ? `${usd(+String(f.c.fee))} ${String(f.c.cycle || "Monthly").toLowerCase()}` : "";
  return (
    <main className="auth">
      <div className="auth-main" style={{ gridColumn: "1 / -1" }}>
        <div className="auth-card" style={{ maxWidth: 480 }}>
          <p className="muted" style={{ margin: 0, fontSize: 13, letterSpacing: ".04em", textTransform: "uppercase" }}>{ok ? f.firm : "Jams Docs and Designs"}</p>
          {ok ? (
            <>
              <h2 style={{ margin: "6px 0 2px" }}>Automatic payments</h2>
              <p className="muted" style={{ margin: 0 }}>{f.c.client} · {f.c.title || "Service contract"} · {f.c.no}</p>
              {fee && <p style={{ margin: "14px 0 0" }}>Fee: <b>{fee}</b>, plus any additional hours billed under the agreement.</p>}
              {f.pm?.status === "active" && status !== "done" && <p style={{ margin: "14px 0 0" }}>Currently saved: <b>{f.pm.label}</b>. Saving a new one replaces it.</p>}
              {note && <div className="msg" style={{ margin: "14px 0" }}>{note}</div>}
              {status !== "done" && (
                <form action={`/api/autopay/${encodeURIComponent(ref)}`} method="post" style={{ marginTop: 18 }}>
                  <button className="btn primary" style={{ width: "100%" }}>{f.pm?.status === "active" ? "Change payment method" : "Set up automatic payments"}</button>
                  <p className="muted" style={{ fontSize: 13, margin: "10px 0 0" }}>Save a card or US bank account (ACH) on Stripe’s secure page. Nothing is charged now; each invoice is charged when it’s issued, and you still receive the invoice.</p>
                </form>
              )}
              {f.firmEmail && <p className="muted" style={{ fontSize: 13, margin: "16px 0 0" }}>Questions? Email {f.firmEmail}.</p>}
            </>
          ) : (
            <>
              <h2 style={{ margin: "6px 0 10px" }}>Automatic payments</h2>
              <div className="msg">{note}</div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
