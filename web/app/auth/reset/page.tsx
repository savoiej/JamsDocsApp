import AuthSide from "../../auth-side";
import ResetForm from "./reset-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "New password · SITREP" };
export const dynamic = "force-dynamic";

export default async function ResetPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return (
    <main className="auth">
      <AuthSide />
      <div className="auth-main">
        <ResetForm email={data.user?.email || undefined} />
      </div>
    </main>
  );
}
