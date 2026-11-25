import { NextResponse } from "next/server";
import { staff } from "@/lib/inbox-m365";
import { waConfigured, waGraph, waMissing } from "@/lib/inbox-wa";

// Is WhatsApp set up, and which business number is it.
// When WA_WABA_ID is set, this also makes sure the app is subscribed to that WhatsApp account,
// because Meta only delivers incoming messages to apps subscribed to the account the number lives in.
let cached: { at: number; number: string; name: string; quality: string; subscribed?: boolean } | null = null;
export async function GET() {
  if (!(await staff())) return NextResponse.json({ message: "Not allowed." }, { status: 403 });
  if (!waConfigured()) return NextResponse.json({ configured: false, missing: waMissing() });
  try {
    if (!cached || Date.now() - cached.at > 10 * 60e3 || cached.subscribed === false) {
      const j = (await waGraph(`${process.env.WA_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating`)) as { display_phone_number?: string; verified_name?: string; quality_rating?: string };
      let subscribed: boolean | undefined;
      const waba = (process.env.WA_WABA_ID || "").trim();
      if (waba) {
        const s = (await waGraph(`${waba}/subscribed_apps`)) as { data?: unknown[] };
        subscribed = !!s.data?.length;
        if (!subscribed) {
          const r = (await waGraph(`${waba}/subscribed_apps`, { method: "POST" })) as { success?: boolean };
          subscribed = !!r.success;
        }
      }
      cached = { at: Date.now(), number: j.display_phone_number || "", name: j.verified_name || "", quality: j.quality_rating || "", subscribed };
    }
    return NextResponse.json({ configured: true, number: cached.number, name: cached.name, quality: cached.quality, subscribed: cached.subscribed });
  } catch (e) {
    return NextResponse.json({ configured: true, error: (e as Error).message });
  }
}
