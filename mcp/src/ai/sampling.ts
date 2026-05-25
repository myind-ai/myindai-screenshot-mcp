// MCP sampling wrapper — sampling-first, key-as-escape-hatch.
//
// Tools should NOT import @anthropic-ai/sdk directly. They should import
// askClient from here. The wrapper picks the best available LLM path:
//
//   1. If the connected MCP client advertises sampling capability → use
//      server.createMessage(...) which forwards to the client's LLM. The
//      client prompts the user for permission. No env var needed.
//   2. If ANTHROPIC_API_KEY is set → fall back to a direct Anthropic SDK
//      call. (CI / non-interactive use case.)
//   3. Otherwise → throw an llm_unavailable error so the caller can
//      degrade gracefully (deterministic fallback) instead of crashing.
//
// This module is the only place that knows about provider SDKs. Add a new
// provider here, every tool benefits automatically.
//
// Wired up in v1.0.0-rc.1 as the public surface; tools migrate from
// direct @anthropic-ai/sdk imports to askClient() across rc.2 → rc.3.

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CreateMessageRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export interface AskClientInput {
  /** Conversation messages in MCP sampling format. */
  messages: Array<{
    role: "user" | "assistant";
    content:
      | { type: "text"; text: string }
      | { type: "image"; data: string; mimeType: string };
  }>;
  /** Optional system prompt. */
  system?: string;
  /** Soft hints — client picks the actual model. */
  modelPreferences?: {
    hints?: Array<{ name?: string }>;
    costPriority?: number;
    speedPriority?: number;
    intelligencePriority?: number;
  };
  /** Hard cap on completion tokens. */
  maxTokens?: number;
  /** Stop sequences. */
  stopSequences?: string[];
}

export interface AskClientOutput {
  /** The completed assistant message. */
  text: string;
  /** Which provider actually served the response. */
  provider: "client-sampling" | "anthropic-direct";
  /** Stop reason if the provider reported one. */
  stopReason?: string;
}

export class LlmUnavailableError extends Error {
  readonly tag = "llm_unavailable";
  constructor(message: string) {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

/**
 * Run a completion through whatever LLM path is available. Tools call this;
 * they don't reach for SDKs directly.
 */
export async function askClient(
  server: Server,
  input: AskClientInput
): Promise<AskClientOutput> {
  // Path 1: client-side sampling.
  if (clientSupportsSampling(server)) {
    return await askViaSampling(server, input);
  }
  // Path 2: direct Anthropic SDK (CI fallback).
  if (process.env.ANTHROPIC_API_KEY) {
    return await askViaAnthropicDirect(input);
  }
  // Path 3: no LLM available.
  throw new LlmUnavailableError(
    "No LLM path available. Either (a) connect via an MCP client that supports sampling, " +
      "or (b) set ANTHROPIC_API_KEY in the server env for non-interactive use."
  );
}

/** Whether the connected MCP client advertised sampling capability on initialize. */
export function clientSupportsSampling(server: Server): boolean {
  try {
    const caps = (server as unknown as { getClientCapabilities?: () => unknown })
      .getClientCapabilities?.();
    return Boolean(caps && (caps as { sampling?: unknown }).sampling);
  } catch {
    return false;
  }
}

async function askViaSampling(
  server: Server,
  input: AskClientInput
): Promise<AskClientOutput> {
  const result = await server.request(
    {
      method: "sampling/createMessage",
      params: {
        messages: input.messages,
        systemPrompt: input.system,
        modelPreferences: input.modelPreferences,
        maxTokens: input.maxTokens ?? 1024,
        stopSequences: input.stopSequences,
      },
    },
    CreateMessageRequestSchema
  );

  // The result shape is { content: { type, text|data, ... }, model, stopReason }
  const content = (result as { content?: { type: string; text?: string } }).content;
  if (!content || content.type !== "text" || typeof content.text !== "string") {
    throw new LlmUnavailableError(
      "Client sampling returned a non-text content block; this tool needs text."
    );
  }
  return {
    text: content.text,
    provider: "client-sampling",
    stopReason: (result as { stopReason?: string }).stopReason,
  };
}

async function askViaAnthropicDirect(input: AskClientInput): Promise<AskClientOutput> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";

  // Convert MCP-format messages to Anthropic SDK format. Image content blocks
  // translate 1:1; text blocks stay text.
  const messages = input.messages.map((m) => ({
    role: m.role,
    content:
      m.content.type === "text"
        ? [{ type: "text" as const, text: m.content.text }]
        : [
            {
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: m.content.mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
                data: m.content.data,
              },
            },
          ],
  }));

  const resp = await client.messages.create({
    model,
    system: input.system,
    messages,
    max_tokens: input.maxTokens ?? 1024,
    stop_sequences: input.stopSequences,
  });

  const block = resp.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "";

  return {
    text,
    provider: "anthropic-direct",
    stopReason: resp.stop_reason ?? undefined,
  };
}
