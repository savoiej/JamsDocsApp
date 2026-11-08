import { type NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/stripe-pay";
import { graph, m365Configured, seal, staff, tokenCall } from "@/lib/inbox-m365";

// Microsoft sends the person back here with a code; it becomes a stored (encrypted) refresh token.
export async function GET(request: NextRequest) {
  const back = (q: string) => {
    const r = NextResponse.redirect(new URL(`/app?inbox=${q}`, request.url), 303);
    r.cookies.set("m365_state", "", { path: "/api/inbox/m365", maxAge: 0 });
    return r;
  };
  const who = await staff();
  if (!who) return back("not_allowed");
  if (!m365Configured()) return back("not_configured");
  const p = request.nextUrl.searchParams;
  if (p.get("error")) return back("declined");
  const state = p.get("state") || "", saved = request.cookies.get("m365_state")?.value || "";
  if (!state || state !== saved) return back("expired");
  try {
    const t = await tokenCall({ grant_type: "authorization_code", code: p.get("code") || "", redirect_uri: new URL("/api/inbox/m365/callback", request.url).toString() });
    if (!t.refresh_token) return back("no_offline");
    const me = await graph<{ mail?: string; userPrincipalName?: string; displayName?: string }>(t.access_token, "/me?$select=mail,userPrincipalName,displayName");
    const email = String(me.mail || me.userPrincipalName || "").toLowerCase();
    if (!email) return back("no_mailbox");
    const db = adminDb();
    const { data: had } = await db.from("inbox_accounts").select("id").eq("provider", "m365").eq("email", email).maybeSingle();
    const row = { provider: "m365", email, name: me.displayName || null, token_enc: seal(t.refresh_token), error: null, created_by: who.userId };
    const { error } = had ? await db.from("inbox_accounts").update(row).eq("id", had.id) : await db.from("inbox_accounts").insert(row);
    if (error) throw new Error(error.message);
    return back("connected");
  } catch (e) {
    console.error("m365 callback", (e as Error).message);
    return back("failed");
  }
}
