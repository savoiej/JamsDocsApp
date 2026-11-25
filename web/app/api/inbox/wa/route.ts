import { NextResponse } from "next/server";
import { staff } from "@/lib/inbox-m365";
import { waConfigured, waGraph, waMissing } from "@/lib/inbox-wa";

// Is WhatsApp set up, and which business number is it.
let cached: { at: number; number: string; name: string; quality: string } | null = null;
export async function GET() {
  if (!(await staff())) return NextResponse.json({ message: "Not allowed." }, { status: 403 });
  if (!waConfigured()) return NextResponse.json({ configured: false, missing: waMissing() });
  try {
    if (!cached || Date.now() - cached.at > 10 * 60e3) {
      const j = (await waGraph(`${process.env.WA_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating`)) as { display_phone_number?: string; verified_name?: string; quality_rating?: string };
      cached = { at: Date.now(), number: j.display_phone_number || "", name: j.verified_name || "", quality: j.quality_rating || "" };
    }
    return NextResponse.json({ configured: true, number: cached.number, name: cached.name, quality: cached.quality });
  } catch (e) {
    return NextResponse.json({ configured: true, error: (e as Error).message });
  }
}
