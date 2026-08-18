import { ChatOpenAI } from "@langchain/openai";

export function createChatModel() {
  return new ChatOpenAI({
    model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
  });
}
