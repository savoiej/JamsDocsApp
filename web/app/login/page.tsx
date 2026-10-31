import AuthSide from "../auth-side";
import LoginForm from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; confirmed?: string; error?: string }> }) {
  const sp = await searchParams;
  const notice = sp.confirmed ? "Email confirmed. Sign in to continue." : sp.error ? "That link has expired or was already used. Sign in, or create the account again." : undefined;
  return (
    <main className="auth">
      <AuthSide />
      <div className="auth-main">
        <LoginForm next={sp.next || "/app"} notice={notice} />
      </div>
    </main>
  );
}
