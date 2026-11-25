import { type NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/stripe-pay";
import { docId, staff } from "@/lib/inbox-m365";
import { waConfigured, waGraph, waNumber } from "@/lib/inbox-wa";

// Sends a WhatsApp text from the business number and records it, so every office device sees it.
export async function POST(request: NextRequest) {
  if (!(await staff())) return NextResponse.json({ message: "Not allowed." }, { status: 403 });
  if (!waConfigured()) return NextResponse.json({ message: "WhatsApp isn't set up on this site yet." }, { status: 503 });
  const b = (await request.json().catch(() => ({}))) as { to?: string; text?: string; replyTo?: string };
  const text = String(b.text || "").trim().slice(0, 4096), to = waNumber(String(b.to || ""));
  if (!text) return NextResponse.json({ message: "Write a reply first." }, { status: 400 });
  if (to.length < 8 || to.length > 15) return NextResponse.json({ message: "That phone number doesn't look right. Include the country code." }, { status: 400 });
  try {
    const j = (await waGraph(`${process.env.WA_PHONE_NUMBER_ID}/messages`, { method: "POST", body: JSON.stringify({
      messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: text, preview_url: false },
      ...(b.replyTo && /^wamid\./.test(b.replyTo) ? { context: { message_id: b.replyTo } } : {}) }) })) as { messages?: { id: string }[] };
    const wamid = j.messages?.[0]?.id || "";
    const id = docId(`wa:${wamid || Date.now()}`);
    await adminDb().from("documents").upsert([{ path: `inboxmsg/${id}`, collection: "inboxmsg", doc_id: id, updated_by: null,
      data: { id, ch: "wa", src: "wa", dir: "out", msgId: wamid, conv: `wa:${to}`, subject: "", name: "", addr: "+" + to, to: ["+" + to], text, att: false, at: Date.now() } }], { onConflict: "path", ignoreDuplicates: true });
    return NextResponse.json({ ok: true, id, wamid });
  } catch (e) {
    const err = e as Error & { code?: number };
    if (err.code === 131047) return NextResponse.json({ message: "It's been more than 24 hours since this client last wrote, so WhatsApp only allows an approved template message now. Call them, or ask them to message you first.", window: "closed" }, { status: 409 });
    if (err.code === 131030) return NextResponse.json({ message: "While your WhatsApp number is in test mode, Meta only delivers to numbers added to its allowed list." }, { status: 409 });
    return NextResponse.json({ message: err.message }, { status: 502 });
  }
}
