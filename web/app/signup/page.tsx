import AuthSide from "../auth-side";
import SignupForm from "./signup-form";

export default function SignupPage() {
  return (
    <main className="auth">
      <AuthSide />
      <div className="auth-main">
        <SignupForm />
      </div>
    </main>
  );
}
