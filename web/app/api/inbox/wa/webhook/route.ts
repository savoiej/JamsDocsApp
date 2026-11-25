import { type NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/stripe-pay";
import { docId } from "@/lib/inbox-m365";
import { waSigOk, waText, type WaMsg } from "@/lib/inbox-wa";

// Meta's WhatsApp webhook. GET answers Meta's one-time verification; POST receives messages.
// Every POST must carry Meta's signature over the raw body, checked before anything is read.
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const tok = process.env.WA_VERIFY_TOKEN;
  if (tok && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === tok) return new NextResponse(q.get("hub.challenge") || "", { status: 200, headers: { "content-type": "text/plain" } });
  return new NextResponse("Forbidden", { status: 403 });
}

type Change = { field?: string; value?: { metadata?: { display_phone_number?: string; phone_number_id?: string }; contacts?: { wa_id?: string; profile?: { name?: string } }[]; messages?: WaMsg[] } };
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!waSigOk(raw, request.headers.get("x-hub-signature-256"))) {
    console.warn("[wa-webhook] rejected: signature did not match WA_APP_SECRET");
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let body: { entry?: { changes?: Change[] }[] };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }
  const mine = process.env.WA_PHONE_NUMBER_ID;
  console.info("[wa-webhook] received", (body.entry || []).flatMap((e) => (e.changes || []).map((c) => c.field)).join(",") || "nothing");
  const rows: object[] = [];
  for (const e of body.entry || []) for (const c of e.changes || []) {
    const v = c.value;
    if (c.field !== "messages" || !v?.messages?.length) continue;
    if (mine && v.metadata?.phone_number_id && v.metadata.phone_number_id !== mine) {
      console.info(`[wa-webhook] skipped: message for another number (${v.metadata.phone_number_id})`);
      continue;
    }
    for (const m of v.messages) {
      const who = (v.contacts || []).find((x) => x.wa_id === m.from) || v.contacts?.[0];
      const id = docId(`wa:${m.id}`);
      rows.push({ path: `inboxmsg/${id}`, collection: "inboxmsg", doc_id: id, updated_by: null,
        data: { id, ch: "wa", src: "wa", dir: "in", msgId: m.id, conv: `wa:${m.from}`, subject: "", name: who?.profile?.name || "", addr: "+" + m.from,
          to: [v.metadata?.display_phone_number || ""], text: waText(m), att: ["image", "video", "document", "audio"].includes(m.type), at: (Number(m.timestamp) || Date.now() / 1000) * 1000 } });
    }
  }
  if (rows.length) {
    try {
      const { error } = await adminDb().from("documents").upsert(rows, { onConflict: "path", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      console.info(`[wa-webhook] stored ${rows.length} message(s)`);
    } catch (e) {
      console.error("[wa-webhook] database error:", (e as Error).message);
      // a 500 makes Meta retry the delivery later
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
