import { readFile } from "node:fs/promises";
import path from "node:path";
import { type NextRequest } from "next/server";
import { getViewer } from "@/lib/supabase/server";
import { siteLinks, storageShim } from "@/lib/app-page";

// The Jams Operations page itself, only for signed-in, approved team members.
export async function GET(request: NextRequest) {
  const { userId, profile } = await getViewer();
  if (!userId) return new Response("Sign in first.", { status: 401 });
  if (!profile?.active) return new Response("Your account is waiting for approval.", { status: 403 });
  const shim = storageShim("jamsos:");
  const html = siteLinks(await readFile(path.join(process.cwd(), "jamsos", "index.html"), "utf8"), request.nextUrl.origin)
    .replace("<head>", `<head><script>${shim}</script>`)
    // the embedded network module gets the same prefix
    .replace("const shim=`<script>window.NL_EMBED=", "const shim=`<script>" + shim + "window.NL_EMBED=");
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
