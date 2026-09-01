"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStream, FetchStreamTransport } from "@langchain/langgraph-sdk/react";
import {
  type AgentInput,
  type ChatMessage,
  type ChatState,
  chatMessageArraySchema,
} from "../../lib/agent-types";
import styles from "./chat.module.css";

function contentToText(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .map((part) => part.text ?? "")
    .filter(Boolean)
    .join("\n");
}

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
  initialMessages: ChatMessage[];
  initialPrompt: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
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

    setError(null);
    try {
      const input: AgentInput = {
        query: text,
        notes: "",
        repoUrl,
        branch,
        multitask_strategy: "interrupt",
      };
      await stream.submit(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run agent");
    }
    setDraft("");
  }, [draft, stream, repoUrl, branch]);

  useEffect(() => {
    if (initialPromptConsumed.current || initialMessages.length > 0 || !initialPrompt) {
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
      notes: "",
      repoUrl,
      branch,
      multitask_strategy: "interrupt",
    };

    void stream.submit(input).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to run agent");
    });
  }, [branch, initialMessages.length, initialPrompt, repoUrl, router, stream, threadId]);

  useEffect(() => {
    if (stream.messages.length > 0) {
      const parsed = chatMessageArraySchema.safeParse(stream.messages);
      if (parsed.success) {
        setMessages(parsed.data);
      }
    }
  }, [stream.messages]);

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
          {messages.length === 0 && !stream.isLoading ? (
            <p className={styles.empty}>
              Describe your task below to start the agent.
            </p>
          ) : (
            <div className={styles.messages}>
              {messages.map((message, index) => (
                <MessageRow key={message.id ?? index} message={message} />
              ))}
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

function MessageRow({ message }: { message: ChatMessage }) {
  const text = contentToText(message.content);

  if (message.type === "human") {
    return (
      <div className={styles.humanRow}>
        <div className={styles.humanBubble}>
          <span className={styles.role}>You</span>
          <p className={styles.text}>{text}</p>
        </div>
      </div>
    );
  }

  if (message.type === "tool") {
    return (
      <div className={styles.toolRow}>
        <div className={styles.toolBubble}>
          <span className={styles.role}>Tool result</span>
          <pre className={styles.code}>{text}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.aiRow}>
      <div className={styles.aiBubble}>
        <span className={styles.role}>Agent</span>
        <p className={styles.text}>{text}</p>
      </div>
    </div>
  );
}
