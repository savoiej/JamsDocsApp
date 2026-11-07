import { redirect } from "next/navigation";
import AuthSide from "../auth-side";
import { getViewer } from "@/lib/supabase/server";

export default async function PendingPage() {
  const { profile } = await getViewer();
  if (profile?.active) redirect("/operations");
  return (
    <main className="auth">
      <AuthSide />
      <div className="auth-main">
        <div className="auth-card">
          <h2>Waiting for approval</h2>
          <p>
            You’re signed in as <b>{profile?.email}</b>. An admin needs to turn on your access before you can see the
            team’s clients, projects and networks.
          </p>
          <p>Once they do, reload this page.</p>
          <div className="row">
            <a className="btn primary" href="/operations">Check again</a>
            <form action="/auth/signout" method="post"><button className="btn">Sign out</button></form>
          </div>
        </div>
      </div>
    </main>
  );
}
