import { readFile } from "node:fs/promises";
import path from "node:path";
import { type NextRequest } from "next/server";
import { getViewer } from "@/lib/supabase/server";
import { siteLinks, storageShim } from "@/lib/app-page";

// The SITREP Client App page, only for signed-in, approved team members.
export async function GET(request: NextRequest) {
  const { userId, profile } = await getViewer();
  if (!userId) return new Response("Sign in first.", { status: 401 });
  if (!profile?.active) return new Response("Your account is waiting for approval.", { status: 403 });
  const html = siteLinks(await readFile(path.join(process.cwd(), "client", "index.html"), "utf8"), request.nextUrl.origin).replace(
    "<head>",
    `<head><script>${storageShim("client:")}</script>`,
  );
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
