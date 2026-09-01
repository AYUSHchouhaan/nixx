import { z } from "zod";

export const messageTypeSchema = z.enum(["human", "ai", "tool", "system"]);

export const messageContentPartSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
});

export const messageContentSchema = z.union([
  z.string(),
  z.array(messageContentPartSchema),
]);

export const toolCallSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  args: z.unknown(),
});

export const chatMessageSchema = z.object({
  id: z.string().optional(),
  type: messageTypeSchema,
  content: messageContentSchema,
  tool_calls: z.array(toolCallSchema).optional(),
  tool_call_id: z.string().optional(),
});

export const chatMessageArraySchema = z.array(chatMessageSchema);

export type MessageType = z.infer<typeof messageTypeSchema>;
export type MessageContentPart = z.infer<typeof messageContentPartSchema>;
export type MessageContent = z.infer<typeof messageContentSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const threadStateSchema = z.object({
  messages: z.array(chatMessageSchema).optional().default([]),
});

export const agentInputSchema = z.object({
  query: z.string(),
  notes: z.string(),
  repoUrl: z.string(),
  branch: z.string(),
  multitask_strategy: z.literal("interrupt"),
});

export type ThreadState = z.infer<typeof threadStateSchema>;
export type AgentInput = z.infer<typeof agentInputSchema>;

export interface ChatState {
  messages: ChatMessage[];
}

export const multitaskStrategySchema = z.enum(["reject", "rollback", "interrupt"]);
export type MultitaskStrategy = z.infer<typeof multitaskStrategySchema>;

export const streamRequestBodySchema = z.object({
  input: z
    .object({
      query: z.string().optional(),
      notes: z.string().optional(),
      repoUrl: z.string().optional(),
      branch: z.string().optional(),
      multitask_strategy: multitaskStrategySchema.optional(),
    })
    .nullable()
    .optional(),
  config: z
    .object({
      configurable: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  multitask_strategy: multitaskStrategySchema.optional(),
  query: z.string().optional(),
  notes: z.string().optional(),
  repoUrl: z.string().optional(),
  branch: z.string().optional(),
});

export type StreamRequestBody = z.infer<typeof streamRequestBodySchema>;

export const threadMetadataSchema = z.object({
  repoUrl: z.string().optional(),
  branch: z.string().optional(),
});

export type ThreadMetadata = z.infer<typeof threadMetadataSchema>;
