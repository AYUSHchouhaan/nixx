import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema } from "@repo/db";
import { cookies } from "next/headers";
import { getInstallationId } from "./github-installation";

async function storeGitHubAccountCredentials(accessToken: string) {
  const installationId = await getInstallationId(accessToken);
  await storeGitHubCredentials(accessToken, installationId);
}

export const GITHUB_ACCESS_TOKEN_COOKIE = "GITHUB_ACCESS_TOKEN_COOKIE";
export const GITHUB_INSTALLATION_ID_COOKIE = "GITHUB_INSTALLATION_ID_COOKIE";

export async function storeGitHubCredentials(accessToken: string, installationId: number) {
  const cookieStore = await cookies();
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
  cookieStore.set(GITHUB_ACCESS_TOKEN_COOKIE, accessToken, options);
  cookieStore.set(GITHUB_INSTALLATION_ID_COOKIE, String(installationId), options);
}

export async function getGitHubToken() {
  return (await cookies()).get(GITHUB_ACCESS_TOKEN_COOKIE)?.value ?? null;
}

export async function getGitHubInstallationId() {
  const value = (await cookies()).get(GITHUB_INSTALLATION_ID_COOKIE)?.value;
  return value ? Number(value) : null;
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    usePlural: true,
  }),
  databaseHooks: {
    account: {
      create: {
        after: async (account) => {
          if (account.providerId === "github" && account.accessToken) {
            await storeGitHubAccountCredentials(account.accessToken);
          }
        },
      },
      update: {
        after: async (account) => {
          if (account.providerId === "github" && account.accessToken) {
            await storeGitHubAccountCredentials(account.accessToken);
          }
        },
      },
    },
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      mapProfileToUser: (profile) => ({
        name: profile.name ?? profile.login,
        email: profile.email ?? `${profile.login}@users.noreply.github.com`,
        image: profile.avatar_url,
      }),
    },
  },
});

export { getInstallationId };
