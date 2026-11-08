import { type NextRequest, NextResponse } from "next/server";
import { accessFor, graph, listAccounts, m365Configured, staff } from "@/lib/inbox-m365";

// Sends a reply from a connected mailbox: as a reply to the client's message when we have it, otherwise a new email.
export async function POST(request: NextRequest) {
  if (!(await staff())) return NextResponse.json({ message: "Not allowed." }, { status: 403 });
  if (!m365Configured()) return NextResponse.json({ message: "Microsoft 365 isn't set up on this site yet." }, { status: 503 });
  const b = (await request.json().catch(() => ({}))) as { account?: string; mailbox?: string; replyTo?: string; to?: string; subject?: string; text?: string };
  const text = String(b.text || "").trim().slice(0, 20000), to = String(b.to || "").trim();
  if (!text) return NextResponse.json({ message: "Write a reply first." }, { status: 400 });
  const accounts = await listAccounts().catch(() => []);
  const a = accounts.find((x) => x.id === b.account) || accounts[0];
  if (!a) return NextResponse.json({ message: "No mailbox is connected." }, { status: 400 });
  const mailbox = String(b.mailbox || a.email).toLowerCase();
  const base = mailbox === a.email ? "/me" : (a.shared || []).includes(mailbox) ? `/users/${encodeURIComponent(mailbox)}` : null;
  if (!base) return NextResponse.json({ message: "That mailbox isn't connected." }, { status: 400 });
  try {
    const tok = await accessFor(a);
    if (b.replyTo) await graph(tok, `${base}/messages/${encodeURIComponent(b.replyTo)}/reply`, { method: "POST", body: JSON.stringify({ comment: text }) });
    else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ message: "That email address doesn't look right." }, { status: 400 });
      await graph(tok, `${base}/sendMail`, { method: "POST", body: JSON.stringify({ message: { subject: String(b.subject || "").slice(0, 250), body: { contentType: "Text", content: text }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: true }) });
    }
    return NextResponse.json({ ok: true, from: mailbox });
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 502 });
  }
}
