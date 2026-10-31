import { redirect } from "next/navigation";
import { getViewer } from "@/lib/supabase/server";
import AppShell from "./app-shell";

export default async function AppPage() {
  const { userId, profile } = await getViewer();
  if (!userId) redirect("/login");
  if (!profile?.active) redirect("/pending");
  return <AppShell profile={profile} />;
}
