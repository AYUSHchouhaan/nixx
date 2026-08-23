import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "./lib/auth";
import styles from "./page.module.css";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const signedIn = Boolean(session);

  return (
    <>
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true" />
            Nixx
          </Link>

          <nav className={styles.navLinks} aria-label="Primary">
            <a href="#how-it-works">How it works</a>
            <a href="#why">Why Nixx</a>
          </nav>

          <div className={styles.navCta}>
            {signedIn ? (
              <span className={styles.signedIn}>
                Signed in as {session?.user.name}
              </span>
            ) : (
              <Link href="/login" className={styles.buttonGhost}>
                Sign in
              </Link>
            )}
            <Link href="/login" className={styles.buttonPrimary}>
              Open app
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <h1 className={styles.heroTitle}>
              Coding tasks, run in a sandbox. Shipped as pull requests.
            </h1>
            <p className={styles.heroSub}>
              Nixx is a coding agent that works inside an isolated sandbox — it
              never touches your machine — and opens a real GitHub pull request
              you can review and merge.
            </p>
            <div className={styles.heroCta}>
              <Link href="/login" className={styles.buttonPrimaryLarge}>
                Open app
              </Link>
              <a href="#how-it-works" className={styles.buttonGhostLarge}>
                How it works
              </a>
            </div>
          </div>

          <div className={styles.heroVisual}>
            <Terminal />
          </div>
        </section>

        <section id="how-it-works" className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>How it works</h2>
            <p className={styles.sectionLed}>
              From a plain-language task to a reviewable pull request, without
              touching your machine.
            </p>
          </div>

          <ol className={styles.steps}>
            <li className={styles.step}>
              <span className={styles.stepNum}>1</span>
              <div>
                <h3 className={styles.stepTitle}>Sign in with GitHub</h3>
                <p className={styles.stepBody}>
                  Connect your account so Nixx can clone your repository and
                  open pull requests on your behalf.
                </p>
              </div>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum}>2</span>
              <div>
                <h3 className={styles.stepTitle}>
                  Pick a repository and branch
                </h3>
                <p className={styles.stepBody}>
                  Choose where the work happens. Nixx provisions an isolated
                  sandbox with a fresh clone.
                </p>
              </div>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum}>3</span>
              <div>
                <h3 className={styles.stepTitle}>Describe the task</h3>
                <p className={styles.stepBody}>
                  Tell the agent what to build in plain language. Its reasoning
                  and execution stay separate, inside the sandbox.
                </p>
              </div>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum}>4</span>
              <div>
                <h3 className={styles.stepTitle}>Review and merge</h3>
                <p className={styles.stepBody}>
                  The agent pushes its work and opens a pull request. Review the
                  diff and merge only what you trust.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section id="why" className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Why Nixx</h2>
            <p className={styles.sectionLed}>
              Built for the way you already work, with safety as the default.
            </p>
          </div>

          <div className={styles.features}>
            <div className={styles.feature}>
              <h3 className={styles.featureTitle}>Isolated by default</h3>
              <p className={styles.featureBody}>
                Every command runs inside a sandbox. Your machine and your other
                work are never touched.
              </p>
            </div>
            <div className={styles.feature}>
              <h3 className={styles.featureTitle}>Real pull requests</h3>
              <p className={styles.featureBody}>
                Work lands as a reviewable pull request, not ephemeral edits.
                Durable output you can inspect, test, and merge.
              </p>
            </div>
            <div className={styles.feature}>
              <h3 className={styles.featureTitle}>GitHub-native</h3>
              <p className={styles.featureBody}>
                Sign in, pick a repository, and results appear where you already
                review code. No new workflow to learn.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.cta}>
          <h2 className={styles.ctaTitle}>
            Start your next task from a sandbox.
          </h2>
          <p className={styles.ctaSub}>
            Sign in with GitHub and give Nixx something to build.
          </p>
          <Link href="/login" className={styles.buttonPrimaryLarge}>
            Open app
          </Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span className={styles.footerBrand}>Nixx</span>
          <span className={styles.footerTag}>
            Sandboxed coding agent. GitHub-native.
          </span>
        </div>
      </footer>
    </>
  );
}

function Terminal() {
  return (
    <div className={styles.terminal}>
      <div className={styles.terminalBar}>
        <span className={styles.terminalDots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className={styles.terminalTitle}>nixx — sandbox</span>
        <span className={styles.terminalStatus}>
          <i className={styles.statusDot} aria-hidden="true" />
          running
        </span>
      </div>

      <div className={styles.terminalBody}>
        <p className={styles.terminalLine}>
          <span className={styles.prompt}>$</span> nixx run{" "}
          <span className={styles.terminalArg}>
            &quot;implement rate limiting on /api/threads&quot;
          </span>
        </p>
        <p className={styles.terminalLineMuted}>
          <span className={styles.caret}>▸</span> cloned{" "}
          <span className={styles.mono}>you/repo</span> @ main
        </p>
        <p className={styles.terminalLineMuted}>
          <span className={styles.caret}>▸</span> sandbox provisioned{" "}
          <span className={styles.mono}>(isolated)</span>
        </p>
        <p className={styles.terminalLineMuted}>
          <span className={styles.caret}>▸</span> agent-brain reasoning…
        </p>
        <p className={styles.terminalLineMuted}>
          <span className={styles.caret}>▸</span> sandbox-worker executing…
        </p>
        <p className={styles.terminalLineOk}>
          <span className={styles.check}>✓</span> tests pass{" "}
          <span className={styles.mono}>(14)</span>
        </p>
        <p className={styles.terminalLineOk}>
          <span className={styles.check}>✓</span> pushed branch{" "}
          <span className={styles.mono}>nixx/8f2a…</span>
        </p>
        <p className={styles.terminalLineOk}>
          <span className={styles.check}>✓</span> opened pull request{" "}
          <span className={styles.mono}>#42</span>
        </p>
      </div>

      <div className={styles.terminalFoot}>
        <div className={styles.prRow}>
          <span className={styles.prTitle}>
            <span className={styles.prHash}>#42</span> implement rate limiting
            on /api/threads
          </span>
          <span className={styles.prBadge}>
            <i className={styles.statusDot} aria-hidden="true" />
            Open
          </span>
        </div>
        <span className={styles.prMeta}>3 files changed · ready to review</span>
      </div>
    </div>
  );
}
