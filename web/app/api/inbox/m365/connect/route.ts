import { type NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { authUrl, m365Configured, staff } from "@/lib/inbox-m365";

// Starts the Microsoft sign-in for one mailbox. A random state in a short-lived cookie guards the return trip.
export async function GET(request: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/app?inbox=${q}`, request.url), 303);
  if (!(await staff())) return back("not_allowed");
  if (!m365Configured()) return back("not_configured");
  const state = randomBytes(24).toString("hex");
  const redirect = new URL("/api/inbox/m365/callback", request.url).toString();
  const res = NextResponse.redirect(authUrl(redirect, state), 303);
  res.cookies.set("m365_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/inbox/m365", maxAge: 600 });
  return res;
}
