import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";

export const metadata: Metadata = {
  title: "Sign in — Nixx",
};

export default function LoginPage() {
  return (
    <main className={styles.wrap}>
      <Link href="/" className={styles.back}>
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M10 3 5 8l5 5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back to Nixx
      </Link>

      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          <span className={styles.brandName}>Nixx</span>
        </div>

        <h1 className={styles.title}>Sign in to Nixx</h1>
        <p className={styles.sub}>
          Connect your GitHub account to run coding tasks in an isolated sandbox
          and open pull requests.
        </p>

        <LoginForm />

        <p className={styles.note}>
          Signing in lets Nixx clone your repository and open pull requests on
          your behalf.
        </p>
      </div>
    </main>
  );
}
