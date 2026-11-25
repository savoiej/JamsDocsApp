"use server";

import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type ResetState = { error?: string; notice?: string } | undefined;

// Emails a password reset link. The answer is the same whether or not the address has an
// account, so the form can't be used to find out who has one.
export async function requestReset(_prev: ResetState, form: FormData): Promise<ResetState> {
  const email = String(form.get("email") || "").trim();
  if (!email) return { error: "Enter the email you sign in with." };
  const h = await headers();
  const origin = h.get("origin") || `https://${h.get("host")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirm` });
  if (error && /rate|seconds|too many/i.test(error.message)) return { error: "A reset email was just sent. Wait a minute, then try again." };
  // The confirm link opens in this browser; this marks it as a reset rather than a sign-up.
  (await cookies()).set("pw_reset", "1", { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 });
  return { notice: `If ${email} has a SITREP account, a reset link is on its way. Open it on this device. Check spam if it isn't there in a few minutes.` };
}
