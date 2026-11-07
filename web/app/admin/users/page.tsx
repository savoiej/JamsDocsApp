import { redirect } from "next/navigation";
import { getViewer, type Profile } from "@/lib/supabase/server";
import MemberRow from "./member-row";

export default async function UsersPage() {
  const { supabase, userId, profile } = await getViewer();
  if (!userId) redirect("/login");
  if (profile?.role !== "admin" || !profile.active) redirect("/app");
  const { data } = await supabase.from("profiles").select("*").order("created_at");
  const people = (data ?? []) as Profile[];
  const waiting = people.filter((p) => !p.active).length;
  return (
    <main className="page">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <a href="/app">Back to SITREP - Operations</a>
          <h1>Team &amp; access</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {waiting ? `${waiting} waiting for approval. ` : ""}Admins manage the team and see the admin console; users work in the app.
          </p>
        </div>
      </div>
      <div className="panel scroll">
        <table>
          <thead>
            <tr><th>Person</th><th>Role</th><th>Access</th><th>Joined</th><th></th></tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <MemberRow key={p.id} person={p} isMe={p.id === userId} />
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
