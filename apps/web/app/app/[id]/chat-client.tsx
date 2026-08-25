"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useStream, FetchStreamTransport } from "@langchain/langgraph-sdk/react";
import styles from "./chat.module.css";

type MessageContent = string | Array<{ type: string; text?: string }>;

type ChatMessage = {
  id?: string;
  type: "human" | "ai" | "tool" | "system";
  content: MessageContent;
  tool_calls?: Array<{ id?: string; name: string; args: unknown }>;
  tool_call_id?: string;
};

type ToolCall = {
  id: string;
  name: string;
  args: unknown;
};

type ToolResult = {
  content: MessageContent;
  status?: string;
};

type ToolCallWithResult = {
  id: string;
  call: ToolCall;
  result?: ToolResult;
  state: "pending" | "completed" | "error";
};

type AgentStream = {
  messages: ChatMessage[];
  toolCalls: ToolCallWithResult[];
  isLoading: boolean;
  error: unknown;
  submit: (values: unknown, options?: unknown) => Promise<void>;
  stop: () => Promise<void>;
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
  conversationId,
  initialPrompt,
  repoUrl,
  branch,
  initialMessages,
}: {
  threadId: string;
  conversationId: string;
  initialPrompt: string;
  repoUrl: string;
  branch: string;
  initialMessages: ChatMessage[];
}) {
  const [draft, setDraft] = useState(initialPrompt);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const transport = useMemo(
    () =>
      new FetchStreamTransport({
        apiUrl: `/api/threads/${threadId}/stream`,
      }),
    [threadId],
  );

  const stream = useStream({
    assistantId: "coding",
    messagesKey: "messages",
    transport,
    threadId,
    initialValues: { messages: initialMessages },
    fetchStateHistory: false,
  } as never) as unknown as AgentStream;

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
        conversationId,
        multitask_strategy: "interrupt",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run agent");
    }
    setDraft("");
  }, [draft, stream, conversationId, repoUrl, branch]);

  const messages: ChatMessage[] =
    stream.messages.length > 0
      ? (stream.messages as ChatMessage[])
      : initialMessages;

  const toolCalls = (stream.toolCalls ?? []) as ToolCallWithResult[];

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
              {toolCalls.map((toolCall) => (
                <ToolCallRow key={toolCall.id} toolCall={toolCall} />
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

function ToolCallRow({ toolCall }: { toolCall: ToolCallWithResult }) {
  const status =
    toolCall.state === "completed"
      ? "done"
      : toolCall.state === "error"
        ? "error"
        : "running";

  return (
    <div className={styles.toolRow}>
      <div className={styles.toolCallBubble}>
        <span className={styles.role}>
          Tool <code className={styles.toolName}>{toolCall.call.name}</code>
        </span>
        <pre className={styles.code}>
          {JSON.stringify(toolCall.call.args, null, 2)}
        </pre>
        {toolCall.result ? (
          <pre className={styles.code}>
            {contentToText(toolCall.result.content)}
          </pre>
        ) : null}
        <span className={styles.status} data-state={status}>
          {status}
        </span>
      </div>
    </div>
  );
}
