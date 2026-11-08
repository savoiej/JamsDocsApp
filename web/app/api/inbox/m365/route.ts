import { type NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/stripe-pay";
import { listAccounts, m365Configured, staff } from "@/lib/inbox-m365";

// GET: is Microsoft 365 set up, and which mailboxes are connected. POST: set shared mailboxes or disconnect one.
export async function GET() {
  if (!(await staff())) return NextResponse.json({ message: "Not allowed." }, { status: 403 });
  if (!m365Configured()) return NextResponse.json({ configured: false, accounts: [] });
  try {
    const acc = await listAccounts();
    return NextResponse.json({ configured: true, accounts: acc.map((a) => ({ id: a.id, email: a.email, name: a.name, shared: a.shared || [], lastSync: a.last_sync, error: a.error })) });
  } catch (e) {
    return NextResponse.json({ configured: true, accounts: [], error: (e as Error).message });
  }
}
export async function POST(request: NextRequest) {
  if (!(await staff())) return NextResponse.json({ message: "Not allowed." }, { status: 403 });
  if (!m365Configured()) return NextResponse.json({ message: "Microsoft 365 isn't set up on this site yet." }, { status: 503 });
  const b = (await request.json().catch(() => ({}))) as { id?: string; shared?: string[]; remove?: boolean };
  if (!b.id) return NextResponse.json({ message: "Which mailbox?" }, { status: 400 });
  if (b.remove) {
    await adminDb().from("inbox_accounts").delete().eq("id", b.id);
    return NextResponse.json({ ok: true });
  }
  const shared = (Array.isArray(b.shared) ? b.shared : []).map((s) => String(s).trim().toLowerCase()).filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)).slice(0, 10);
  const { error } = await adminDb().from("inbox_accounts").update({ shared }).eq("id", b.id);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, shared });
}
