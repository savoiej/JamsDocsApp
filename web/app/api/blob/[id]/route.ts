import { type NextRequest, NextResponse } from "next/server";
import { getViewer } from "@/lib/supabase/server";

// /_blob/<id> → a short-lived signed link to the stored file (photos, floor plans, spec sheets).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId, profile } = await getViewer();
  if (!userId || !profile?.active) return new Response("Not allowed.", { status: 403 });
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(id)) return new Response("Not found.", { status: 404 });
  const { data, error } = await supabase.storage.from("assets").createSignedUrl(id, 300);
  if (error || !data) return new Response("Not found.", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { status: 302 });
}
