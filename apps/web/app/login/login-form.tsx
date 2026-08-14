"use client";

import { useState } from "react";
import { createAuthClient } from "better-auth/client";

const authClient = createAuthClient();

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setError(null);
    const { error } = await authClient.signIn.social({
      provider: "github",
      callbackURL: "/",
    });

    if (error) {
      setError(error.message ?? "Something went wrong");
    }
  };

  return (
    <div style={{ display: "grid", gap: "16px", justifyItems: "center" }}>
      <button type="button" onClick={signIn}>
        Sign in with GitHub
      </button>
      {error ? <p style={{ color: "red" }}>{error}</p> : null}
    </div>
  );
}
