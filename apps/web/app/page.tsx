import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "./lib/auth";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return (
      <main style={{ display: "grid", placeItems: "center", minHeight: "100svh" }}>
        <Link href="/login">Sign in with GitHub</Link>
      </main>
    );
  }

  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100svh" }}>
      <div style={{ display: "grid", gap: "8px", textAlign: "center" }}>
        <p>You are logged in</p>
        <h1>Name: {session.user.name}</h1>
        <p>Email: {session.user.email}</p>
      </div>
    </main>
  );
}
