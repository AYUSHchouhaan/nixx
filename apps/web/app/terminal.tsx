import styles from "./page.module.css";

export function Terminal() {
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
