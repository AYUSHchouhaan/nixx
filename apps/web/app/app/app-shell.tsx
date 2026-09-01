"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createAuthClient } from "better-auth/client";
import styles from "./app.module.css";

const authClient = createAuthClient();

type Repository = {
  full_name: string;
  owner: { login: string };
  name: string;
  clone_url: string;
  default_branch: string;
};

type Branch = {
  name: string;
};

type Thread = {
  id: string;
  title: string | null;
  repoUrl: string | null;
  branch: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function AppShell({
  initialThreads,
}: {
  initialThreads: Thread[];
}) {
  const router = useRouter();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [repoLoading, setRepoLoading] = useState(true);
  const [branchLoading, setBranchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [threads] = useState<Thread[]>(initialThreads);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/github/repositories");
        if (!res.ok) throw new Error("Failed to load repositories");
        const data = (await res.json()) as { repositories: Repository[] };
        if (active) setRepositories(data.repositories);
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to load repositories",
          );
        }
      } finally {
        if (active) setRepoLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedRepo) {
      setBranches([]);
      setSelectedBranch("");
      return;
    }

    let active = true;
    setBranchLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams({
          owner: selectedRepo.owner.login,
          repo: selectedRepo.name,
        });
        const res = await fetch(`/api/github/branches?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load branches");
        const data = (await res.json()) as { branches: Branch[] };
        if (active) {
          setBranches(data.branches);
          setSelectedBranch(
            data.branches.find(
              (branch) => branch.name === selectedRepo.default_branch,
            )?.name ?? data.branches[0]?.name ?? "",
          );
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load branches");
        }
      } finally {
        if (active) setBranchLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedRepo]);

  const handleRepoChange = useCallback((fullName: string) => {
    const repo = repositories.find((item) => item.full_name === fullName);
    setSelectedRepo(repo ?? null);
  }, [repositories]);

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || !selectedRepo || !selectedBranch) return;

    setLoading(true);
    setError(null);
    try {
      const threadRes = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: selectedRepo.clone_url,
          branch: selectedBranch,
          title: prompt.trim().slice(0, 60),
        }),
      });
      if (!threadRes.ok) throw new Error("Failed to create thread");
      const thread = (await threadRes.json()) as { id: string };

      const params = new URLSearchParams({ prompt: prompt.trim() });
      router.push(`/app/${thread.id}?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }, [prompt, selectedRepo, selectedBranch, router]);

  const repoOptions = useMemo(
    () =>
      repositories.map((repo) => (
        <option key={repo.full_name} value={repo.full_name}>
          {repo.full_name}
        </option>
      )),
    [repositories],
  );

  const signOut = useCallback(async () => {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }, [router]);

  return (
    <div className={styles.shell}>
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true" />
            Nixx
          </Link>
          <nav className={styles.navLinks} aria-label="App">
            <span className={styles.status}><i aria-hidden="true" /> Agent ready</span>
          </nav>
          <div className={styles.navCta}>
            <button
              type="button"
              className={styles.signOut}
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

        <main className={styles.main}>
          <section className={styles.composer}>
            <div className={styles.composerHead}>
              <h1 className={styles.composerTitle}>What should Nixx work on?</h1>
              <p className={styles.composerSub}>Describe a coding task and Nixx will handle it in an isolated sandbox.</p>
            </div>

            <div className={styles.inputBox}>
              <div className={styles.inputTop}>
                <span className={styles.target}><strong>nixx</strong><span>@</span><span>github</span></span>
                <span className={styles.separator}>:</span>
                <label className={styles.selectField}>
                  <span className={styles.srOnly}>Repository</span>
                  <select className={styles.select} value={selectedRepo?.full_name ?? ""} onChange={(event) => handleRepoChange(event.target.value)} disabled={repoLoading}>
                    <option value="">{repoLoading ? "Loading repositories..." : "Select repository"}</option>
                    {repoOptions}
                  </select>
                </label>
                <span className={styles.separator}>:</span>
                <label className={styles.selectField}>
                  <span className={styles.srOnly}>Branch</span>
                  <select className={styles.select} value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)} disabled={!selectedRepo || branchLoading}>
                    <option value="">{branchLoading ? "Loading branches..." : "Select branch"}</option>
                    {branches.map((branch) => <option key={branch.name} value={branch.name}>{branch.name}</option>)}
                  </select>
                </label>
              </div>
              <textarea
                className={styles.textarea}
                placeholder="Describe your coding task or ask a question..."
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSubmit();
                  }
                }}
                rows={3}
              />
              <div className={styles.inputFoot}>
                <span className={styles.hint}>Shift + Enter for a new line</span>
                <button
                  type="button"
                  className={styles.submit}
                  onClick={() => void handleSubmit()}
                  disabled={!prompt.trim() || !selectedRepo || !selectedBranch || loading}
                  aria-label="Run task"
                >
                  <span>{loading ? "Starting" : "Run task"}</span>
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 9-5-2.2 5L12 13 3 8Z" /></svg>
                </button>
              </div>
            </div>

            {error ? <p className={styles.error} role="alert">{error}</p> : null}
          </section>

          <section className={styles.activity}>
            <div className={styles.activityHead}>
              <div>
                <h2 className={styles.activityTitle}>Recent threads</h2>
                <p className={styles.activitySub}>Your latest agent sessions</p>
              </div>
              <span className={styles.count}>{threads.length}</span>
            </div>
          {threads.length === 0 ? (
            <div className={styles.empty}><span className={styles.emptyIcon}>+</span><p>No threads yet. Start a task above.</p></div>
          ) : (
            <ul className={styles.threadGrid}>
              {threads.map((thread) => (
                <li key={thread.id} className={styles.threadCard}>
                  <Link href={`/app/${thread.id}`} className={styles.listLink}>
                    <span className={styles.cardTop}><span className={styles.cardStatus}><span className={styles.threadDot} />Ready</span><span className={styles.cardTime}>{new Date(thread.updatedAt).toLocaleDateString()}</span></span>
                    <span className={styles.listTitle}>{thread.title ?? "Untitled task"}</span>
                    <span className={styles.listMeta}>{thread.repoUrl ?? "GitHub repository"} / {thread.branch ?? "Default branch"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          </section>
      </main>
    </div>
  );
}
