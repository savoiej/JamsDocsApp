import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Online invoice payments (Stripe Checkout) for SITREP - Operations.
 * Invoices stay in the app (documents row meta/invoices). A pay link carries the invoice id and a
 * random token saved on the invoice; the server re-reads the invoice and works out the balance
 * itself, so a link can never pay a different amount. The webhook writes one document per Checkout
 * Session under stripepay/, and the app applies it to the invoice.
 *
 * Environment (Vercel, Production, marked Sensitive):
 *   STRIPE_SECRET_KEY          restricted key (rk_...) with Checkout Sessions: write, PaymentIntents: read, Charges: read
 *   STRIPE_WEBHOOK_SECRET      signing secret (whsec_...) of the webhook endpoint /api/stripe/webhook
 *   SUPABASE_SERVICE_ROLE_KEY  Supabase secret key, used only on the server to read invoices and record payments
 */

let stripeClient: Stripe | null = null;
export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("not_configured");
  if (!stripeClient) stripeClient = new Stripe(key, { appInfo: { name: "SITREP - Operations", url: "https://app.jamsdocsanddesigns.com" } });
  return stripeClient;
}

let admin: SupabaseClient | null = null;
export function adminDb() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("not_configured");
  if (!admin) admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export const payConfigured = () => !!(process.env.STRIPE_SECRET_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

type Line = { desc?: string; qty?: number; rate?: number; tax?: boolean };
export type Invoice = {
  id: string; no: string; clientId?: string; project?: string; issued?: string; due?: string; sentAt?: string | null; void?: boolean;
  lines: Line[]; taxPct?: number; payments?: { amount?: number; ref?: string }[]; payToken?: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
/* the same arithmetic as the app's invCalc */
export function invTotals(v: Invoice) {
  const lines = v.lines || [];
  const sub = r2(lines.reduce((s, l) => s + (+l.qty! || 0) * (+l.rate! || 0), 0));
  const taxable = lines.filter((l) => l.tax).reduce((s, l) => s + (+l.qty! || 0) * (+l.rate! || 0), 0);
  const tax = r2((taxable * (+v.taxPct! || 0)) / 100);
  const total = r2(sub + tax);
  const paid = r2((v.payments || []).reduce((s, p) => s + (+p.amount! || 0), 0));
  return { sub, tax, total, paid, bal: r2(total - paid) };
}

async function readDoc<T>(db: SupabaseClient, path: string): Promise<T | null> {
  const { data } = await db.from("documents").select("data").eq("path", path).maybeSingle();
  if (!data) return null;
  const d = data.data as { json?: string } & Record<string, unknown>;
  try {
    return (typeof d.json === "string" ? JSON.parse(d.json) : d) as T;
  } catch {
    return null;
  }
}

/* "invoiceId.token" -> the invoice, its client and the firm, or null when the link is wrong */
export async function loadByRef(ref: string) {
  const m = /^([A-Za-z0-9_-]{3,64})\.([A-Za-z0-9]{16,64})$/.exec(String(ref || ""));
  if (!m) return null;
  const db = adminDb();
  const [invoices, clients, settings] = await Promise.all([
    readDoc<Invoice[]>(db, "meta/invoices"),
    readDoc<{ id: string; name: string; contacts?: { email?: string; primary?: boolean }[] }[]>(db, "meta/clients"),
    readDoc<{ name?: string; email?: string; phone?: string }>(db, "meta/settings"),
  ]);
  const inv = (invoices || []).find((v) => v.id === m[1]);
  // constant-time compare of the token
  if (!inv || !inv.payToken || inv.payToken.length !== m[2].length) return null;
  let diff = 0;
  for (let i = 0; i < m[2].length; i++) diff |= inv.payToken.charCodeAt(i) ^ m[2].charCodeAt(i);
  if (diff) return null;
  const client = (clients || []).find((c) => c.id === inv.clientId) || null;
  const contact = client?.contacts?.find((c) => c.primary) || client?.contacts?.[0];
  const { data: pend } = await db.from("documents").select("data").eq("collection", "stripepay").filter("data->>invoiceId", "eq", inv.id);
  const pending = (pend || []).map((r) => r.data as PayDoc).filter((d) => d.status === "processing");
  return { inv, totals: invTotals(inv), client, email: contact?.email || "", firm: settings?.name || "Jams Docs and Designs", firmEmail: settings?.email || "", pending };
}

export type PayDoc = {
  sessionId: string; invoiceId: string; invoiceNo: string; amount: number; status: "paid" | "processing" | "failed";
  method: string; pi: string; date: string; at: string;
};
export async function recordPayment(d: PayDoc) {
  const { error } = await adminDb()
    .from("documents")
    .upsert({ path: `stripepay/${d.sessionId}`, collection: "stripepay", doc_id: d.sessionId, data: d, updated_by: null }, { onConflict: "path" });
  if (error) throw new Error(error.message);
}

/* label for the Checkout integration in the Stripe Dashboard */
export const INTEGRATION_ID = "sitrep_invoice_pay_qkzmvwta";
