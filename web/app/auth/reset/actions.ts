"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type NewPwState = { error?: string } | undefined;

export async function setNewPassword(_prev: NewPwState, form: FormData): Promise<NewPwState> {
  const password = String(form.get("password") || "");
  const again = String(form.get("again") || "");
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };
  if (password !== again) return { error: "The two passwords don’t match." };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "This reset link has expired. Request a new one from the sign-in page." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: /same|different/i.test(error.message) ? "Choose a password you haven’t used for this account." : error.message };
  redirect("/app");
}
