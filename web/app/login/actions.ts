"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; notice?: string } | undefined;

function safeNext(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/app";
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  if (!email || !password) return { error: "Enter your email and password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      error: /confirm/i.test(error.message)
        ? "Confirm your email first: open the link we sent you, then sign in."
        : "That email and password don’t match an account.",
    };
  }
  redirect(safeNext(form.get("next")));
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const full_name = String(form.get("full_name") || "").trim();
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  if (!full_name || !email) return { error: "Enter your name and email." };
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };
  const supabase = await createClient();
  const h = await headers();
  const origin = h.get("origin") || `https://${h.get("host")}`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name }, emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) return { error: error.message };
  if (data.session) redirect("/app");
  return { notice: `Check ${email} for a link to confirm your account, then sign in.` };
}
