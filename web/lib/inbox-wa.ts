import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * WhatsApp for the SITREP client inbox, through Meta's WhatsApp Business Platform (Cloud API).
 * Clients message the business number; Meta posts each message to /api/inbox/wa/webhook, which
 * verifies Meta's signature and stores it as inboxmsg/<id> (office staff only, like email).
 * Replies go out from the business number through /api/inbox/wa/send. WhatsApp allows free-form
 * replies for 24 hours after the client's last message; after that only an approved template.
 *
 * Environment (Vercel, Production, Sensitive):
 *   WA_TOKEN             permanent access token for a Meta system user with whatsapp_business_messaging
 *   WA_PHONE_NUMBER_ID   the business number's Phone number ID (WhatsApp > API Setup)
 *   WA_APP_SECRET        the Meta app's App secret (signs every webhook call)
 *   WA_VERIFY_TOKEN      any long random string, also typed into Meta's webhook setup
 *   SUPABASE_SERVICE_ROLE_KEY  server-only database key (stores incoming messages)
 */
export const waConfigured = () => !!(process.env.WA_TOKEN && process.env.WA_PHONE_NUMBER_ID && process.env.WA_APP_SECRET && process.env.WA_VERIFY_TOKEN && process.env.SUPABASE_SERVICE_ROLE_KEY);
export const waMissing = () => ["WA_TOKEN", "WA_PHONE_NUMBER_ID", "WA_APP_SECRET", "WA_VERIFY_TOKEN", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
const VER = () => process.env.WA_GRAPH_VERSION || "v23.0";

const waErr = (msg: string, code?: number) => Object.assign(new Error(msg), { code }) as Error & { code?: number };

export async function waGraph(path: string, init?: RequestInit) {
  // Pasted values often carry a stray space or line break; never echo the token back in an error.
  const token = (process.env.WA_TOKEN || "").replace(/\s+/g, "");
  if (!token) throw waErr("WA_TOKEN is empty in Vercel.");
  if (/^sb_|^eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/.test(token)) throw waErr("WA_TOKEN holds a Supabase key, not a WhatsApp token. Paste the token from Meta's \"Generate token\" into WA_TOKEN in Vercel and redeploy.");
  let r: Response;
  try {
    r = await fetch(`https://graph.facebook.com/${VER()}/${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers || {}) },
      cache: "no-store",
    });
  } catch {
    throw waErr("Couldn't reach WhatsApp. Check that WA_TOKEN in Vercel is the token from Meta, with nothing else in it.");
  }
  const j = (await r.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_data?: { details?: string } } } & Record<string, unknown>;
  if (!r.ok || j.error) {
    throw waErr((j.error?.error_data?.details || j.error?.message || `WhatsApp answered ${r.status}`).split(token).join("…"), j.error?.code);
  }
  return j;
}

/* Meta signs the raw body with the app secret: X-Hub-Signature-256: sha256=<hex> */
export function waSigOk(raw: string, header: string | null) {
  const secret = process.env.WA_APP_SECRET;
  if (!secret || !header || !header.startsWith("sha256=")) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(raw, "utf8").digest("hex"));
  const got = Buffer.from(header.slice(7));
  return want.length === got.length && timingSafeEqual(want, got);
}

/* digits only, US 10-digit numbers get the 1 country code */
export function waNumber(v: string) {
  const d = String(v || "").replace(/\D/g, "");
  return d.length === 10 ? "1" + d : d;
}

type Msg = { id: string; from: string; timestamp: string; type: string; text?: { body?: string }; image?: { caption?: string }; video?: { caption?: string }; document?: { caption?: string; filename?: string }; audio?: object; location?: { latitude?: number; longitude?: number; name?: string; address?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }; contacts?: { name?: { formatted_name?: string } }[]; reaction?: { emoji?: string } };
export function waText(m: Msg) {
  switch (m.type) {
    case "text": return m.text?.body || "";
    case "image": return `(photo, open WhatsApp to view)${m.image?.caption ? "\n" + m.image.caption : ""}`;
    case "video": return `(video, open WhatsApp to view)${m.video?.caption ? "\n" + m.video.caption : ""}`;
    case "document": return `(file: ${m.document?.filename || "document"}, open WhatsApp to view)${m.document?.caption ? "\n" + m.document.caption : ""}`;
    case "audio": return "(voice message, open WhatsApp to listen)";
    case "location": return `(location) ${[m.location?.name, m.location?.address].filter(Boolean).join(", ") || ""} https://maps.google.com/?q=${m.location?.latitude},${m.location?.longitude}`.trim();
    case "button": return m.button?.text || "";
    case "interactive": return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || "";
    case "contacts": return `(contact card: ${m.contacts?.[0]?.name?.formatted_name || "contact"})`;
    case "reaction": return m.reaction?.emoji ? `(reacted ${m.reaction.emoji})` : "";
    case "sticker": return "(sticker)";
    default: return `(${m.type} message, open WhatsApp to view)`;
  }
}
export type { Msg as WaMsg };
