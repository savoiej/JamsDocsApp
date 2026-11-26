import { readFile } from "node:fs/promises";
import path from "node:path";
import { type NextRequest } from "next/server";
import { getViewer } from "@/lib/supabase/server";
import { networkModule, siteLinks, storageShim } from "@/lib/app-page";

// The SITREP Client App page, only for signed-in, approved team members.
// It is SITREP's own network module, unpacked from jamsnet/index.html, so both always match.
export async function GET(request: NextRequest) {
  const { userId, profile } = await getViewer();
  if (!userId) return new Response("Sign in first.", { status: 401 });
  if (!profile?.active) return new Response("Your account is waiting for approval.", { status: 403 });
  const origin = request.nextUrl.origin;
  const page = networkModule(await readFile(path.join(process.cwd(), "jamsnet", "index.html"), "utf8"))
    // links the module builds to itself (QR labels, shared links) point at the Client App, not SITREP
    .replaceAll("https://claude.ai/artifact/1du4BSTFvnCX4tamvmsKuG", `${origin}/client`)
    .replace(/<title>[^<]*<\/title>/, "<title>SITREP · Client App</title>");
  const html = siteLinks(page, origin).replace("<head>", `<head><script>${storageShim("client:")}</script>`);
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
