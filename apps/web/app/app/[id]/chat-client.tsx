"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStream, FetchStreamTransport } from "@langchain/langgraph-sdk/react";
import {
  type AgentInput,
  type ChatState,
  type MessageLike,
} from "../../lib/agent-types";
import { MessageView } from "./message-view";
import styles from "./chat.module.css";

export function ChatClient({
  threadId,
  repoUrl,
  branch,
  initialMessages,
  initialPrompt,
}: {
  threadId: string;
  repoUrl: string;
  branch: string;
  initialMessages: MessageLike[];
  initialPrompt: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageLike[]>(initialMessages);
  const initialPromptConsumed = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const transport = useMemo(
    () =>
      new FetchStreamTransport({
        apiUrl: `/api/threads/${threadId}/stream`,
      }),
    [threadId],
  );

  const stream = useStream<ChatState>({
    messagesKey: "messages",
    transport,
    threadId,
    initialValues: { messages: initialMessages },
  });

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text || stream.isLoading) return;

    setDraft("");
    setError(null);
    try {
      const input: AgentInput = {
        query: text,
        repoUrl,
        branch,
        multitask_strategy: "interrupt",
      };
      await stream.submit(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run agent");
    }
  }, [draft, stream, repoUrl, branch]);

  useEffect(() => {
    if (
      initialPromptConsumed.current ||
      initialMessages.length > 0 ||
      !initialPrompt
    ) {
      return;
    }

    initialPromptConsumed.current = true;
    setMessages([
      {
        id: `initial-${threadId}`,
        type: "human",
        content: initialPrompt,
      },
    ]);
    router.replace(`/app/${threadId}`, { scroll: false });

    const input: AgentInput = {
      query: initialPrompt,
      repoUrl,
      branch,
      multitask_strategy: "interrupt",
    };

    void stream.submit(input).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to run agent");
    });
  }, [
    branch,
    initialMessages.length,
    initialPrompt,
    repoUrl,
    router,
    stream,
    threadId,
  ]);

  useEffect(() => {
    if (stream.messages.length > 0) {
      setMessages(stream.messages as MessageLike[]);
    }
  }, [stream.messages]);

  const summary =
    typeof stream.values?.summary === "string" && stream.values.summary
      ? stream.values.summary
      : null;

  return (
    <div className={styles.shell}>
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true" />
            Nixx
          </Link>
          <Link href="/app" className={styles.backLink}>
            ← App
          </Link>
          <div className={styles.threadMeta}>
            <span className={styles.metaLabel}>repo</span>
            <span className={styles.metaValue}>{repoUrl || "—"}</span>
            {branch ? (
              <>
                <span className={styles.metaLabel}>branch</span>
                <span className={styles.metaValue}>{branch}</span>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.scroll} ref={scrollRef}>
          {messages.length === 0 && !stream.isLoading && !summary ? (
            <p className={styles.empty}>
              Describe your task below to start the agent.
            </p>
          ) : (
            <div className={styles.messages}>
              {messages.map((message, index) => (
                <MessageView
                  key={message.id ?? index}
                  message={message}
                  messages={messages}
                />
              ))}
              {summary && !stream.isLoading ? (
                <div className={styles.aiRow}>
                  <div className={styles.aiBubble}>
                    <p className={styles.text}>{summary}</p>
                  </div>
                </div>
              ) : null}
              {stream.isLoading ? (
                <div className={styles.thinking}>
                  <span className={styles.thinkingDot} aria-hidden="true" />
                  Agent is working…
                </div>
              ) : null}
            </div>
          )}

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className={styles.composer}>
          <textarea
            className={styles.textarea}
            placeholder="Describe your task…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            rows={3}
          />
          <div className={styles.composerFoot}>
            <span className={styles.hint}>Enter to run</span>
            <button
              type="button"
              className={styles.submit}
              onClick={() => void submit()}
              disabled={!draft.trim() || stream.isLoading}
            >
              {stream.isLoading ? "Running…" : "Run task"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
