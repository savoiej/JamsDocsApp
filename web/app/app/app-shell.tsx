"use client";

import { useEffect, useState } from "react";
import type { Profile } from "@/lib/supabase/server";
import { createBridge } from "@/lib/jams-bridge";

declare global {
  interface Window {
    jamsBridge?: ReturnType<typeof createBridge>;
  }
}

/** JamsNET runs in a frame; it reaches Supabase through window.jamsBridge, which stands in for the claude.ai runtime it was built on. */
export default function AppShell({ profile }: { profile: Profile }) {
  const [doc, setDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.jamsBridge = createBridge(profile);
    let alive = true;
    fetch("/api/jamsnet", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then((html) => {
        if (!alive) return;
        const shim =
          "<script>try{Object.defineProperty(window,'claude',{value:{use:function(n){return parent.jamsBridge.use(n)}},configurable:true})}catch(e){window.claude={use:function(n){return parent.jamsBridge.use(n)}}}" +
          "try{if(parent.location.hash)history.replaceState(null,'',parent.location.hash)}catch(e){}</script>";
        setDoc(html.replace("<head>", "<head>" + shim));
      })
      .catch(() => alive && setError("JamsNET couldn’t load. Reload the page to try again."));
    return () => {
      alive = false;
    };
  }, [profile]);

  return (
    <div className="shell">
      <header className="shellbar">
        <b>JamsNET</b>
        <span className="who">
          {profile.full_name || profile.email}
        </span>
        {profile.role === "admin" && <span className="tag">Admin</span>}
        {profile.role === "admin" && <a href="/admin/users">Team &amp; access</a>}
        <form action="/auth/signout" method="post">
          <button type="submit">Sign out</button>
        </form>
      </header>
      {error ? (
        <div className="loading" role="alert">{error}</div>
      ) : doc ? (
        <iframe className="appframe" title="JamsNET" srcDoc={doc} />
      ) : (
        <div className="loading">Opening JamsNET…</div>
      )}
    </div>
  );
}
