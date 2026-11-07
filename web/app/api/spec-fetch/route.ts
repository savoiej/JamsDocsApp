import { type NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getViewer } from "@/lib/supabase/server";

/**
 * /api/spec-fetch?url=… — downloads a manufacturer's spec sheet (PDF or image) for the library,
 * because brands' sites don't let a browser read their files directly. Public https sites only;
 * private and local addresses are refused. Signed-in, approved people only.
 */
export const maxDuration = 30;
const MAX = 20 * 1024 * 1024;

function privateAddr(ip: string) {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return privateAddr(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function safeUrl(raw: string): Promise<URL | null> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) || !host.includes(".") || /(^|\.)(localhost|local|internal|lan|home|corp)$/i.test(host)) return null;
  try {
    const addrs = await lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => privateAddr(a.address))) return null;
  } catch {
    return null;
  }
  return u;
}

export async function GET(request: NextRequest) {
  const { userId, profile } = await getViewer();
  if (!userId || !profile?.active) return NextResponse.json({ message: "Not allowed." }, { status: 403 });
  let url = await safeUrl(request.nextUrl.searchParams.get("url") || "");
  if (!url) return NextResponse.json({ message: "Use a public https link." }, { status: 400 });

  // follow up to 4 redirects, checking each hop
  let res: Response | null = null;
  for (let hop = 0; hop < 5; hop++) {
    res = await fetch(url, { redirect: "manual", headers: { accept: "application/pdf,image/*;q=0.9,*/*;q=0.5", "user-agent": "SITREP spec sheet reader" }, signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (!res) return NextResponse.json({ message: "Couldn't reach that site." }, { status: 502 });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      const next = await safeUrl(new URL(res.headers.get("location")!, url).toString());
      if (!next) return NextResponse.json({ message: "That link redirects somewhere it can't be read from." }, { status: 400 });
      url = next;
      continue;
    }
    break;
  }
  if (!res || !res.ok || !res.body) return NextResponse.json({ message: `The site answered ${res ? res.status : "nothing"}.` }, { status: 502 });
  const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const looksPdf = type === "application/pdf" || /\.pdf$/i.test(url.pathname) || type === "application/octet-stream";
  if (!looksPdf && !/^image\/(png|jpeg|webp|gif)$/.test(type)) return NextResponse.json({ message: "That link isn't a PDF or an image." }, { status: 415 });
  if (Number(res.headers.get("content-length") || 0) > MAX) return NextResponse.json({ message: "That file is over 20 MB." }, { status: 413 });

  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX) {
      reader.cancel().catch(() => {});
      return NextResponse.json({ message: "That file is over 20 MB." }, { status: 413 });
    }
    parts.push(value);
  }
  const buf = new Uint8Array(size);
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.byteLength;
  }
  const isPdf = buf.length > 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
  if (looksPdf && !isPdf && !/^image\//.test(type)) return NextResponse.json({ message: "That link didn't return a PDF." }, { status: 415 });
  return new Response(buf, { headers: { "content-type": isPdf ? "application/pdf" : type, "cache-control": "private, no-store" } });
}
