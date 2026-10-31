"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp } from "../login/actions";

export default function SignupForm() {
  const [state, action, pending] = useActionState(signUp, undefined);
  if (state?.notice) {
    return (
      <div className="auth-card">
        <h2>Check your email</h2>
        <div className="msg ok">{state.notice}</div>
        <p>An admin then turns on your access to the team’s data.</p>
        <Link className="btn" href="/login">Back to sign in</Link>
      </div>
    );
  }
  return (
    <form action={action} className="auth-card">
      <h2>Create an account</h2>
      <p>The first account becomes the admin. Everyone after that can sign in once an admin approves them.</p>
      {state?.error && <div className="msg err" role="alert">{state.error}</div>}
      <label className="field">Your name<input name="full_name" autoComplete="name" required /></label>
      <label className="field">Email<input name="email" type="email" autoComplete="email" required /></label>
      <label className="field">Password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
      <button className="btn primary" disabled={pending}>{pending ? "Creating…" : "Create account"}</button>
      <p>Already have one? <Link href="/login">Sign in</Link></p>
    </form>
  );
}
