import { NextResponse } from "next/server";
import { adminDb } from "@/lib/stripe-pay";
import { accessFor, cleanBody, docId, graph, listAccounts, m365Configured, staff } from "@/lib/inbox-m365";

// Reads new mail since the last sync from each connected mailbox (inbox and Sent Items, plus shared
// mailboxes) and writes one inboxmsg/<id> document per message. The app decides which belong to clients.
export const maxDuration = 60;
type Addr = { emailAddress?: { name?: string; address?: string } };
type GMsg = { id: string; conversationId?: string; subject?: string; from?: Addr; toRecipients?: Addr[]; receivedDateTime?: string; sentDateTime?: string; body?: { content?: string }; bodyPreview?: string; hasAttachments?: boolean };

export async function POST() {
  if (!(await staff())) return NextResponse.json({ message: "Not allowed." }, { status: 403 });
  if (!m365Configured()) return NextResponse.json({ configured: false, added: 0 });
  const db = adminDb();
  let accounts;
  try { accounts = await listAccounts(); } catch (e) { return NextResponse.json({ message: (e as Error).message }, { status: 500 }); }
  let added = 0;
  const results: { email: string; added: number; error?: string }[] = [];
  for (const a of accounts) {
    const startedAt = new Date().toISOString();
    const since = new Date(a.last_sync ? Date.parse(a.last_sync) - 10 * 60e3 : Date.now() - 14 * 864e5).toISOString();
    let n = 0;
    try {
      const tok = await accessFor(a);
      const boxes = [{ base: "/me", addr: a.email }, ...(a.shared || []).map((s) => ({ base: `/users/${encodeURIComponent(s)}`, addr: s }))];
      for (const box of boxes) {
        for (const [folder, dir, field] of [["inbox", "in", "receivedDateTime"], ["sentitems", "out", "sentDateTime"]] as const) {
          let url: string | undefined = `${box.base}/mailFolders/${folder}/messages?` + new URLSearchParams({ $filter: `${field} ge ${since}`, $orderby: `${field} desc`, $top: "50", $select: "id,conversationId,subject,from,toRecipients,receivedDateTime,sentDateTime,body,bodyPreview,hasAttachments" });
          for (let page = 0; url && page < 6; page++) {
            const j: { value?: GMsg[]; "@odata.nextLink"?: string } = await graph(tok, url);
            const rows = (j.value || []).map((m) => {
              const other = dir === "in" ? m.from?.emailAddress : m.toRecipients?.[0]?.emailAddress;
              const at = Date.parse((dir === "in" ? m.receivedDateTime : m.sentDateTime) || "") || Date.now();
              const id = docId(`m365:${box.addr}:${m.id}`);
              return { path: `inboxmsg/${id}`, collection: "inboxmsg", doc_id: id, updated_by: null,
                data: { id, ch: "email", src: "m365", mailbox: box.addr, account: a.id, dir, msgId: m.id, conv: m.conversationId || "", subject: m.subject || "",
                  name: other?.name || "", addr: String(other?.address || "").toLowerCase(), to: (m.toRecipients || []).map((r) => r.emailAddress?.address).filter(Boolean),
                  text: cleanBody(m.body?.content || m.bodyPreview || ""), att: !!m.hasAttachments, at } };
            });
            if (rows.length) {
              const { error } = await db.from("documents").upsert(rows, { onConflict: "path", ignoreDuplicates: true });
              if (error) throw new Error(error.message);
              n += rows.length;
            }
            url = j["@odata.nextLink"];
          }
        }
      }
      await db.from("inbox_accounts").update({ last_sync: startedAt, error: null }).eq("id", a.id);
      results.push({ email: a.email, added: n });
    } catch (e) {
      const msg = (e as Error).message.slice(0, 300);
      await db.from("inbox_accounts").update({ error: msg }).eq("id", a.id);
      results.push({ email: a.email, added: n, error: msg });
    }
    added += n;
  }
  // keep 60 days of synced mail
  await db.from("documents").delete().eq("collection", "inboxmsg").lt("data->>at", String(Date.now() - 60 * 864e5));
  return NextResponse.json({ configured: true, added, results });
}
