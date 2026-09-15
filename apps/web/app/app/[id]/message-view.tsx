"use client";

import { useState } from "react";
import { type MessageLike, type ToolCallLike } from "../../lib/agent-types";
import styles from "./chat.module.css";

type ActionType =
  | "grep"
  | "glob"
  | "read"
  | "shell"
  | "create_file"
  | "edit"
  | "task_complete"
  | "tool";

interface ActionItemProps {
  actionType: ActionType;
  status: "generating" | "done";
  success: boolean;
  query?: string;
  patterns?: string[];
  filePaths?: string[];
  command?: string;
  filePath?: string;
  content?: string;
  edits?: Array<{ oldStr: string; newStr: string }>;
  summary?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  output?: string;
}

export function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const block = part as Record<string, unknown>;
      if (typeof block.text === "string") return block.text;
      return "";
    })
    .filter(Boolean)
    .join(" ");
}

function toolArgsOf(toolCall: ToolCallLike): Record<string, unknown> {
  const args = toolCall.args;
  if (args && typeof args === "object") return args as Record<string, unknown>;
  return {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function mapToolCallToAction(toolCall: ToolCallLike): ActionItemProps {
  const args = toolArgsOf(toolCall);

  switch (toolCall.name) {
    case "grep":
      return {
        actionType: "grep",
        status: "generating",
        success: false,
        query: String(args.query ?? ""),
      };
    case "glob":
      return {
        actionType: "glob",
        status: "generating",
        success: false,
        patterns: stringArray(args.patterns),
      };
    case "read":
      return {
        actionType: "read",
        status: "generating",
        success: false,
        filePaths: stringArray(args.filePaths),
      };
    case "run":
      return {
        actionType: "shell",
        status: "generating",
        success: false,
        command: String(args.command ?? ""),
      };
    case "create_file":
      return {
        actionType: "create_file",
        status: "generating",
        success: false,
        filePath: String(args.filePath ?? ""),
        content: String(args.content ?? ""),
      };
    case "edit":
      return {
        actionType: "edit",
        status: "generating",
        success: false,
        filePath: String(args.filePath ?? ""),
        edits: Array.isArray(args.edits)
          ? (args.edits as Array<{ oldStr: string; newStr: string }>)
          : [],
      };
    case "mark_task_complete":
      return {
        actionType: "task_complete",
        status: "generating",
        success: false,
        summary: String(args.summary ?? ""),
      };
    default:
      return {
        actionType: "tool",
        status: "generating",
        success: false,
        toolName: toolCall.name,
        args,
      };
  }
}

function mapToolMessageToAction(
  message: MessageLike,
  messages: MessageLike[],
): ActionItemProps {
  const output = contentToText(message.content) || "Empty result";
  const success = message.status !== "error";

  const toolCall = messages
    .filter((m) => m.type === "ai")
    .flatMap((m) => m.tool_calls ?? [])
    .find((tc) => tc.id === message.tool_call_id);

  if (!toolCall) {
    return {
      actionType: "tool",
      status: "done",
      success,
      toolName: message.name ?? "tool",
      output,
    };
  }

  const args = toolArgsOf(toolCall);

  switch (toolCall.name) {
    case "grep":
      return {
        actionType: "grep",
        status: "done",
        success,
        query: String(args.query ?? ""),
        output,
      };
    case "glob":
      return {
        actionType: "glob",
        status: "done",
        success,
        patterns: stringArray(args.patterns),
        output,
      };
    case "read":
      return {
        actionType: "read",
        status: "done",
        success,
        filePaths: stringArray(args.filePaths),
        output,
      };
    case "run":
      return {
        actionType: "shell",
        status: "done",
        success,
        command: String(args.command ?? ""),
        output,
      };
    case "create_file":
      return {
        actionType: "create_file",
        status: "done",
        success,
        filePath: String(args.filePath ?? ""),
        content: String(args.content ?? ""),
        output,
      };
    case "edit":
      return {
        actionType: "edit",
        status: "done",
        success,
        filePath: String(args.filePath ?? ""),
        edits: Array.isArray(args.edits)
          ? (args.edits as Array<{ oldStr: string; newStr: string }>)
          : [],
        output,
      };
    case "mark_task_complete":
      return {
        actionType: "task_complete",
        status: "done",
        success,
        summary: String(args.summary ?? ""),
        output,
      };
    default:
      return {
        actionType: "tool",
        status: "done",
        success,
        toolName: toolCall.name,
        args,
        output,
      };
  }
}

function actionLabel(action: ActionItemProps): string {
  switch (action.actionType) {
    case "shell":
      return "run";
    case "task_complete":
      return "mark_task_complete";
    case "tool":
      return action.toolName ?? "tool";
    default:
      return action.actionType;
  }
}

function actionSummary(action: ActionItemProps): string {
  switch (action.actionType) {
    case "grep":
      return action.query ?? "";
    case "glob":
      return action.patterns?.join(", ") ?? "";
    case "read":
      return action.filePaths?.join(", ") ?? "";
    case "shell":
      return action.command ?? "";
    case "create_file":
      return action.filePath ?? "";
    case "edit":
      return action.filePath ?? "";
    case "task_complete":
      return action.summary ?? "";
    case "tool": {
      if (!action.args || Object.keys(action.args).length === 0) return "";
      return JSON.stringify(action.args);
    }
    default:
      return "";
  }
}

function statusText(action: ActionItemProps): string {
  if (action.status !== "done") return "Working…";
  return action.success ? "Done" : "Failed";
}

function canExpand(action: ActionItemProps): boolean {
  if (action.status !== "done") return false;
  if (action.actionType === "edit") {
    return Boolean(action.output) || Boolean(action.edits?.length);
  }
  return Boolean(action.output);
}

function ActionDetails({ action }: { action: ActionItemProps }) {
  if (action.actionType === "edit" && action.edits?.length) {
    return (
      <div className={styles.toolDetails}>
        <div className={styles.editList}>
          {action.edits.map((edit, index) => (
            <div key={index} className={styles.editItem}>
              <div className={styles.editLine} data-kind="removed">
                <span className={styles.editMarker}>-</span>
                <code className={styles.editCode}>{edit.oldStr}</code>
              </div>
              <div className={styles.editLine} data-kind="added">
                <span className={styles.editMarker}>+</span>
                <code className={styles.editCode}>{edit.newStr}</code>
              </div>
            </div>
          ))}
        </div>
        {action.output ? (
          <pre className={styles.toolOutput}>{action.output}</pre>
        ) : null}
      </div>
    );
  }

  return action.output ? (
    <pre className={styles.toolOutput}>{action.output}</pre>
  ) : null;
}

function ActionItem({ action }: { action: ActionItemProps }) {
  const [expanded, setExpanded] = useState(false);
  const state =
    action.status !== "done"
      ? "generating"
      : action.success
        ? "done"
        : "error";
  const label = actionLabel(action);
  const summary = actionSummary(action);

  return (
    <div className={styles.actionItem}>
      <div className={styles.actionHeader}>
        <div className={styles.actionMeta}>
          <span className={styles.toolName}>{label}</span>
          {summary ? <span className={styles.toolArgs}>{summary}</span> : null}
        </div>
        <span className={styles.status} data-state={state}>
          {statusText(action)}
        </span>
        {canExpand(action) ? (
          <button
            type="button"
            className={styles.chevronBtn}
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Collapse output" : "Expand output"}
          >
            {expanded ? "▴" : "▾"}
          </button>
        ) : null}
      </div>
      {expanded ? <ActionDetails action={action} /> : null}
    </div>
  );
}

function ActionStep({
  actions,
  reasoningText,
}: {
  actions: ActionItemProps[];
  reasoningText?: string;
}) {
  const [showReasoning, setShowReasoning] = useState(Boolean(reasoningText));

  return (
    <div className={styles.actionStep}>
      {reasoningText ? (
        <div className={styles.reasoning}>
          <button
            type="button"
            className={styles.reasoningToggle}
            onClick={() => setShowReasoning(!showReasoning)}
          >
            <span
              className={
                showReasoning
                  ? `${styles.chevron} ${styles.chevronOpen}`
                  : styles.chevron
              }
              aria-hidden="true"
            >
              ▾
            </span>
            {showReasoning ? "Hide reasoning" : "Show reasoning"}
          </button>
          {showReasoning ? (
            <p className={styles.reasoningBody}>{reasoningText}</p>
          ) : null}
        </div>
      ) : null}
      <div className={styles.actions}>
        {actions.map((action, index) => (
          <ActionItem key={index} action={action} />
        ))}
      </div>
    </div>
  );
}

function HumanMessageView({ message }: { message: MessageLike }) {
  const text = contentToText(message.content);
  return (
    <div className={styles.humanRow}>
      <div className={styles.humanBubble}>
        <p className={styles.text}>{text}</p>
      </div>
    </div>
  );
}

function EnvironmentStatusView({ message }: { message: MessageLike }) {
  const steps = contentToText(message.content).split("\n").filter(Boolean);
  const [title, ...items] = steps;

  return (
    <div className={styles.environmentStatus}>
      <div className={styles.environmentTitle}>
        <span className={styles.environmentCheck} aria-hidden="true">✓</span>
        {title}
      </div>
      <div className={styles.environmentItems}>
        {items.map((item) => (
          <div className={styles.environmentItem} key={item}>
            <span className={styles.environmentCheck} aria-hidden="true">✓</span>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MessageView({
  message,
  messages,
}: {
  message: MessageLike;
  messages: MessageLike[];
}) {
  if (message.name === "environment-status") {
    return <EnvironmentStatusView message={message} />;
  }

  if (message.type === "human") {
    return <HumanMessageView message={message} />;
  }

  if (message.type === "tool") {
    const consumed = messages.some(
      (m) =>
        m.type === "ai" &&
        (m.tool_calls ?? []).some((tc) => tc.id === message.tool_call_id),
    );
    if (consumed) return null;
    return <ActionItem action={mapToolMessageToAction(message, messages)} />;
  }

  const reasoningText = contentToText(message.content);
  const toolCalls = message.tool_calls ?? [];

  if (toolCalls.length > 0) {
    const actions = toolCalls.map((toolCall) => {
      const toolMessage = messages.find(
        (m) => m.type === "tool" && m.tool_call_id === toolCall.id,
      );
      return toolMessage
        ? mapToolMessageToAction(toolMessage, messages)
        : mapToolCallToAction(toolCall);
    });
    return <ActionStep actions={actions} reasoningText={reasoningText} />;
  }

  return (
    <div className={styles.aiRow}>
      <div className={styles.aiBubble}>
        {reasoningText ? <p className={styles.text}>{reasoningText}</p> : null}
      </div>
    </div>
  );
}
