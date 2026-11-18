import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";
import { ConfigError, env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export type ProviderId = "anthropic" | "openai";
export type ChatMessage = { role: "user" | "assistant"; content: string };
export type AiUsage = { provider: ProviderId; model: string; inputTokens: number; outputTokens: number; costUsd: number };

// Approximate list prices per million tokens; configurable via env for cost tracking.
const PRICE = {
  anthropic: { in: Number(process.env.ANTHROPIC_PRICE_IN ?? 3), out: Number(process.env.ANTHROPIC_PRICE_OUT ?? 15) },
  openai: { in: Number(process.env.OPENAI_PRICE_IN ?? 0.4), out: Number(process.env.OPENAI_PRICE_OUT ?? 1.6) },
};
const cost = (p: ProviderId, i: number, o: number) => (i * PRICE[p].in + o * PRICE[p].out) / 1_000_000;

/** Active provider from admin settings, falling back to whichever key is configured. */
export async function activeProvider(): Promise<ProviderId> {
  let wanted: ProviderId = "openai";
  try {
    const { data } = await createAdminClient().from("app_settings").select("value").eq("key", "ai_provider").maybeSingle();
    if (data?.value === "openai" || data?.value === "anthropic") wanted = data.value;
  } catch {
    /* settings unavailable: use default */
  }
  if (wanted === "anthropic" && env.anthropicKey) return "anthropic";
  if (wanted === "openai" && env.openaiKey) return "openai";
  if (env.anthropicKey) return "anthropic";
  if (env.openaiKey) return "openai";
  throw new ConfigError("anthropic");
}

/**
 * Structured generation: the model must return data matching the zod schema.
 * Anthropic: forced tool call. OpenAI: strict JSON-schema response format.
 */
export async function generateStructured<S extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: S;
  name: string;
  maxTokens?: number;
  provider?: ProviderId;
}): Promise<{ data: z.infer<S>; usage: AiUsage }> {
  const provider = opts.provider ?? (await activeProvider());
  const jsonSchema = z.toJSONSchema(opts.schema, { target: "draft-7" }) as Record<string, unknown>;
  delete jsonSchema.$schema;

  if (provider === "anthropic") {
    if (!env.anthropicKey) throw new ConfigError("anthropic");
    const client = new Anthropic({ apiKey: env.anthropicKey });
    const res = await client.messages.create({
      model: env.anthropicModel,
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.system,
      tools: [{ name: opts.name, description: "Return the result in this exact structure.", input_schema: jsonSchema as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "tool", name: opts.name },
      messages: [{ role: "user", content: opts.prompt }],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") throw new Error("AI_NO_STRUCTURED_OUTPUT");
    const data = opts.schema.parse(block.input);
    const u = res.usage;
    return { data, usage: { provider, model: env.anthropicModel, inputTokens: u.input_tokens, outputTokens: u.output_tokens, costUsd: cost(provider, u.input_tokens, u.output_tokens) } };
  }

  if (!env.openaiKey) throw new ConfigError("openai");
  const client = new OpenAI({ apiKey: env.openaiKey });
  const res = await client.chat.completions.create({
    model: env.openaiModel,
    max_completion_tokens: opts.maxTokens ?? 8000,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.prompt },
    ],
    response_format: { type: "json_schema", json_schema: { name: opts.name, schema: jsonSchema, strict: false } },
  });
  const text = res.choices[0]?.message?.content;
  if (!text) throw new Error("AI_NO_STRUCTURED_OUTPUT");
  const data = opts.schema.parse(JSON.parse(text));
  const i = res.usage?.prompt_tokens ?? 0;
  const o = res.usage?.completion_tokens ?? 0;
  return { data, usage: { provider, model: env.openaiModel, inputTokens: i, outputTokens: o, costUsd: cost(provider, i, o) } };
}

/** Plain chat completion (used by the tutor). */
export async function chat(opts: { system: string; messages: ChatMessage[]; maxTokens?: number }): Promise<{ text: string; usage: AiUsage }> {
  const provider = await activeProvider();
  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey: env.anthropicKey! });
    const res = await client.messages.create({ model: env.anthropicModel, max_tokens: opts.maxTokens ?? 2000, system: opts.system, messages: opts.messages });
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const u = res.usage;
    return { text, usage: { provider, model: env.anthropicModel, inputTokens: u.input_tokens, outputTokens: u.output_tokens, costUsd: cost(provider, u.input_tokens, u.output_tokens) } };
  }
  const client = new OpenAI({ apiKey: env.openaiKey! });
  const res = await client.chat.completions.create({
    model: env.openaiModel,
    max_completion_tokens: opts.maxTokens ?? 2000,
    messages: [{ role: "system", content: opts.system }, ...opts.messages],
  });
  const i = res.usage?.prompt_tokens ?? 0;
  const o = res.usage?.completion_tokens ?? 0;
  return { text: res.choices[0]?.message?.content ?? "", usage: { provider, model: env.openaiModel, inputTokens: i, outputTokens: o, costUsd: cost(provider, i, o) } };
}
