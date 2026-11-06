import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/supabase/server";
import AppShell from "../app/app-shell";

export const metadata: Metadata = { title: "Jams Operations · Jams Docs and Designs" };

export default async function OperationsPage() {
  const { userId, profile } = await getViewer();
  if (!userId) redirect("/login");
  if (!profile?.active) redirect("/pending");
  return <AppShell profile={profile} app="jamsos" />;
}
