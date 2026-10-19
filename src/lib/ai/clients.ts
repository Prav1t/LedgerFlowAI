import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/config/env";

/**
 * Dual-LLM strategy: OpenAI is the primary extraction engine (native
 * strict structured outputs); Claude is the fallback via forced tool use.
 * Model ids are env-overridable so upgrades don't require a deploy.
 */
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5";
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;

export function openai(): OpenAI {
  openaiClient ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return openaiClient;
}

export function anthropic(): Anthropic {
  anthropicClient ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return anthropicClient;
}
