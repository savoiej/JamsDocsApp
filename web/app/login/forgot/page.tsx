import AuthSide from "../../auth-side";
import ForgotForm from "./forgot-form";

export const metadata = { title: "Reset password · SITREP" };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="auth">
      <AuthSide />
      <div className="auth-main">
        <ForgotForm expired={!!sp.error} />
      </div>
    </main>
  );
}
