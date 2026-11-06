import { readFile } from "node:fs/promises";
import path from "node:path";
import { type NextRequest } from "next/server";
import { getViewer } from "@/lib/supabase/server";

/* Jams Operations keeps its browser storage under its own prefix, so it never mixes with SITREP on the same site. */
const STORAGE_SHIM =
  "(function(){var P='jamsos:',S;try{S=window.localStorage}catch(e){return}" +
  "function ks(){var a=[];for(var j=0;j<S.length;j++){var k=S.key(j);if(k&&k.indexOf(P)===0)a.push(k.slice(P.length))}return a}" +
  "var o={getItem:function(k){return S.getItem(P+k)},setItem:function(k,v){S.setItem(P+k,String(v))},removeItem:function(k){S.removeItem(P+k)}," +
  "clear:function(){ks().forEach(function(k){S.removeItem(P+k)})},key:function(i){var a=ks();return a[i]==null?null:a[i]}};" +
  "Object.defineProperty(o,'length',{get:function(){return ks().length}});" +
  "try{Object.defineProperty(window,'localStorage',{value:o,configurable:true})}catch(e){}})();";

/** Adds the storage prefix to the page and to its embedded network module, and points artifact links at this site. */
function prepareJamsOS(html: string, origin: string) {
  return html
    .replaceAll("https://claude.ai/artifact/Rp5GENCYKRYw6nnA2LJdE8", `${origin}/operations`)
    .replaceAll("https://claude.ai/artifact/XqWiKrqY6AnbRVYwFpFqmw", `${origin}/operations`)
    .replaceAll("https://claude.ai/artifact/HTnSSukvAoNNfVikhxhhqs", `${origin}/app`)
    .replaceAll("https://claude.ai/artifact/1du4BSTFvnCX4tamvmsKuG", `${origin}/app`)
    .replace("<head>", `<head><script>${STORAGE_SHIM}</script>`)
    .replace("const shim=`<script>window.NL_EMBED=", "const shim=`<script>" + STORAGE_SHIM + "window.NL_EMBED=");
}

// The Jams Operations page itself, only for signed-in, approved team members.
export async function GET(request: NextRequest) {
  const { userId, profile } = await getViewer();
  if (!userId) return new Response("Sign in first.", { status: 401 });
  if (!profile?.active) return new Response("Your account is waiting for approval.", { status: 403 });
  const html = await readFile(path.join(process.cwd(), "jamsos", "index.html"), "utf8");
  return new Response(prepareJamsOS(html, request.nextUrl.origin), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
