import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { adminDb } from "@/lib/stripe-pay";
import { getViewer } from "@/lib/supabase/server";

/**
 * Microsoft 365 email for the SITREP client inbox.
 * Each staff member signs in once; the refresh token is stored encrypted in public.inbox_accounts
 * (no row access for anyone but the server). A sync reads new mail from the inbox and Sent Items
 * (and any shared mailboxes added) and writes one document per message under inboxmsg/<id>;
 * the app matches them to clients. Replies go out through Graph from the same mailbox.
 *
 * Environment (Vercel, Production, Sensitive):
 *   M365_CLIENT_ID, M365_CLIENT_SECRET, M365_TENANT_ID   from the Microsoft Entra app registration
 *   SUPABASE_SERVICE_ROLE_KEY                             server-only database key
 */
export const M365_SCOPES = "offline_access openid email User.Read Mail.Read Mail.Send Mail.Read.Shared Mail.Send.Shared";
export const m365Configured = () => !!(process.env.M365_CLIENT_ID && process.env.M365_CLIENT_SECRET && process.env.M365_TENANT_ID && process.env.SUPABASE_SERVICE_ROLE_KEY);
const tenant = () => process.env.M365_TENANT_ID || "common";
export const authUrl = (redirect: string, state: string) =>
  `https://login.microsoftonline.com/${encodeURIComponent(tenant())}/oauth2/v2.0/authorize?` +
  new URLSearchParams({ client_id: process.env.M365_CLIENT_ID!, response_type: "code", redirect_uri: redirect, response_mode: "query", scope: M365_SCOPES, state, prompt: "select_account" });

/* staff only: signed in, active, not a technician */
export async function staff() {
  const { userId, profile } = await getViewer();
  return userId && profile?.active && profile.role !== "tech" ? { userId, profile } : null;
}

/* tokens at rest: AES-256-GCM, key from the app's client secret */
const key = () => createHash("sha256").update("sitrep-inbox:" + (process.env.M365_CLIENT_SECRET || "")).digest();
export function seal(s: string) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  const out = Buffer.concat([c.update(s, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), out].map((b) => b.toString("base64")).join(".");
}
export function unseal(s: string) {
  const [iv, tag, data] = s.split(".").map((x) => Buffer.from(x, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

type Tok = { access_token: string; refresh_token?: string; expires_in: number; error?: string; error_description?: string };
export async function tokenCall(params: Record<string, string>): Promise<Tok> {
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant())}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.M365_CLIENT_ID!, client_secret: process.env.M365_CLIENT_SECRET!, scope: M365_SCOPES, ...params }),
  });
  const j = (await r.json().catch(() => ({}))) as Tok;
  if (!r.ok || !j.access_token) throw new Error(j.error_description?.split("\r\n")[0] || j.error || `Microsoft sign-in answered ${r.status}`);
  return j;
}

export type Account = { id: string; email: string; name: string | null; shared: string[]; token_enc: string; last_sync: string | null; error: string | null; created_by: string | null };
export async function listAccounts(): Promise<Account[]> {
  const { data, error } = await adminDb().from("inbox_accounts").select("*").eq("provider", "m365").order("created_at");
  if (error) throw new Error(error.message);
  return (data || []) as Account[];
}
/* a fresh access token for an account; saves the rotated refresh token */
export async function accessFor(a: Account) {
  const t = await tokenCall({ grant_type: "refresh_token", refresh_token: unseal(a.token_enc) });
  if (t.refresh_token) await adminDb().from("inbox_accounts").update({ token_enc: seal(t.refresh_token) }).eq("id", a.id);
  return t.access_token;
}
export async function graph<T>(tok: string, path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path.startsWith("http") ? path : `https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: { authorization: `Bearer ${tok}`, prefer: 'outlook.body-content-type="text"', ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers || {}) },
  });
  if (r.status === 202 || r.status === 204) return {} as T;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: { message?: string } }).error?.message || `Microsoft Graph answered ${r.status}`);
  return j as T;
}

/* the new part of an email body: stop at the quoted earlier message */
export function cleanBody(t: string) {
  const lines = String(t || "").replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const l of lines) {
    if (/^\s*(-{2,}\s*Original Message\s*-{2,}|_{8,})\s*$/i.test(l)) break;
    if (/^\s*On .{6,}wrote:\s*$/i.test(l)) break;
    if (/^\s*From:\s.+/i.test(l) && out.some((x) => x.trim())) break;
    if (/^\s*>/.test(l)) continue;
    out.push(l);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 8000);
}
export const docId = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);
