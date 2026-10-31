"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/supabase/server";

export type ActionResult = { error?: string } | undefined;

export async function updateMember(id: string, change: { role?: "admin" | "user"; active?: boolean }): Promise<ActionResult> {
  const { supabase, profile } = await getViewer();
  if (profile?.role !== "admin" || !profile.active) return { error: "Only an admin can change access." };
  // The database also enforces this (RLS policy + role guard trigger), including keeping one active admin.
  const { error } = await supabase.from("profiles").update(change).eq("id", id);
  if (error) return { error: /at least one active admin/i.test(error.message) ? "Keep at least one active admin." : error.message };
  revalidatePath("/admin/users");
  return undefined;
}
