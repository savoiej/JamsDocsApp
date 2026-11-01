import { readFile } from "node:fs/promises";
import path from "node:path";
import { type NextRequest } from "next/server";
import { getViewer } from "@/lib/supabase/server";

// The Netline page itself, only for signed-in, approved team members.
export async function GET(request: NextRequest) {
  const { userId, profile } = await getViewer();
  if (!userId) return new Response("Sign in first.", { status: 401 });
  if (!profile?.active) return new Response("Your account is waiting for approval.", { status: 403 });
  let html = await readFile(path.join(process.cwd(), "jamsnet", "index.html"), "utf8");
  // QR labels and portal links point back to this site instead of the old claude.ai artifact
  html = html.replaceAll("https://claude.ai/artifact/1du4BSTFvnCX4tamvmsKuG", `${request.nextUrl.origin}/app`);
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
