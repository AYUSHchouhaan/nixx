import { describe, expect, test } from "bun:test";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { lastAIMessage } from "./messages";

describe("lastAIMessage", () => {
  test("returns the most recent AI message", () => {
    const messages = [
      new HumanMessage("hello"),
      new AIMessage("first reply"),
      new HumanMessage("follow-up"),
      new AIMessage("second reply"),
    ];

    const result = lastAIMessage(messages);

    expect(result).toBeInstanceOf(AIMessage);
    expect(result?.content).toBe("second reply");
  });

  test("ignores non-AI messages that come after an AI message", () => {
    const messages = [
      new AIMessage("reply"),
      new ToolMessage({ content: "result", tool_call_id: "call_1" }),
      new SystemMessage("system"),
    ];

    expect(lastAIMessage(messages)?.content).toBe("reply");
  });

  test("returns undefined when no AI message is present", () => {
    const messages = [
      new HumanMessage("hello"),
      new SystemMessage("system"),
      new ToolMessage({ content: "result", tool_call_id: "call_1" }),
    ];

    expect(lastAIMessage(messages)).toBeUndefined();
  });

  test("returns undefined for an empty message list", () => {
    expect(lastAIMessage([])).toBeUndefined();
  });
});
