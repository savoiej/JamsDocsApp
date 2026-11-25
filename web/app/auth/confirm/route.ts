import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// Confirmation links land here: either ?token_hash=…&type=… or ?code=… (PKCE).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const to = request.nextUrl.clone();
  to.search = "";

  const supabase = await createClient();
  let ok = false;
  if (token_hash && type) ok = !(await supabase.auth.verifyOtp({ type, token_hash })).error;
  else if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;

  // A password reset link (type=recovery, or a code opened in the browser that asked for a reset)
  // goes to the new-password page instead of the app.
  const jar = await cookies();
  const reset = type === "recovery" || jar.get("pw_reset")?.value === "1";
  to.pathname = ok ? (reset ? "/auth/reset" : "/app") : reset ? "/login/forgot" : "/login";
  if (!ok) to.searchParams.set("error", "link");
  const res = NextResponse.redirect(to);
  if (reset) res.cookies.delete("pw_reset");
  return res;
}
