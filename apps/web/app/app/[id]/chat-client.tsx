"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStream, FetchStreamTransport } from "@langchain/langgraph-sdk/react";
import styles from "./chat.module.css";

type MessageContent = string | Array<{ type: string; text?: string }>;

export type ChatMessage = {
  id?: string;
  type: "human" | "ai" | "tool" | "system";
  content: MessageContent;
  tool_calls?: Array<{ id?: string; name: string; args: unknown }>;
  tool_call_id?: string;
};

type StreamMessage = {
  type: string;
  content: unknown;
  id?: string;
  tool_calls?: Array<{ id?: string; name: string; args: unknown }>;
  tool_call_id?: string;
};

type ChatMessageType = ChatMessage["type"];

function isChatMessage(message: StreamMessage): message is StreamMessage & { type: ChatMessageType } {
  return ["human", "ai", "tool", "system"].includes(message.type);
}

function toChatMessages(messages: StreamMessage[]): ChatMessage[] {
  return messages.flatMap((message) => {
    if (!isChatMessage(message)) return [];

    const content =
      typeof message.content === "string"
        ? message.content
        : Array.isArray(message.content)
          ? message.content.flatMap((part) => {
              if (typeof part !== "object" || part === null || !("type" in part)) return [];
              const text = "text" in part && typeof part.text === "string" ? part.text : undefined;
              return [{ type: String(part.type), text }];
            })
          : String(message.content);

    return [{
      id: message.id,
      type: message.type,
      content,
      tool_calls: message.tool_calls,
      tool_call_id: message.tool_call_id,
    }];
  });
}

type ChatState = {
  messages: ChatMessage[];
};

type AgentInput = {
  query: string;
  notes: string;
  repoUrl: string;
  branch: string;
  multitask_strategy: "interrupt";
};

function contentToText(content: MessageContent): string {
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
      await stream.submit({
        query: text,
        notes: "",
        repoUrl,
        branch,
        multitask_strategy: "interrupt",
      } satisfies AgentInput);
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

    void stream.submit({
      query: initialPrompt,
      notes: "",
      repoUrl,
      branch,
      multitask_strategy: "interrupt",
    } satisfies AgentInput).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to run agent");
    });
  }, [branch, initialMessages.length, initialPrompt, repoUrl, router, stream, threadId]);

  useEffect(() => {
    if (stream.messages.length > 0) {
      setMessages(toChatMessages(stream.messages));
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

