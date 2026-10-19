import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, openai, ANTHROPIC_MODEL, OPENAI_MODEL } from "./clients";
import {
  classificationSchema,
  schemaForType,
  type Classification,
  type ExtractionResult,
} from "./schemas";
import { logger } from "@/lib/utils/logger";

/** Keep prompts well under context limits; financial docs front-load the signal. */
const MAX_PROMPT_CHARS = 60_000;

const CLASSIFY_SYSTEM = `You classify financial documents for a bookkeeping system.
Read the document text and identify its type. BILL is a payable invoice received from a supplier; INVOICE may be issued or received. Use OTHER only when nothing fits.
Respond only through the provided schema.`;

const EXTRACT_SYSTEM = `You extract structured data from financial documents for double-entry bookkeeping.
Rules:
- Extract only what is present; use null for absent fields. Never invent values.
- Amounts are plain decimal numbers without currency symbols or thousands separators.
- Dates are ISO YYYY-MM-DD.
- For bank account numbers, output only the last 4 digits masked like ****1234.
- Set confidence honestly: 0.95+ only when every key field is unambiguous.
Respond only through the provided schema.`;

function clip(text: string): string {
  return text.length > MAX_PROMPT_CHARS ? `${text.slice(0, MAX_PROMPT_CHARS)}\n…[truncated]` : text;
}

/**
 * Run a schema-constrained completion. OpenAI first (native strict JSON
 * schema), Claude as fallback (forced tool_use). The Zod parse at the end
 * is the real contract — regardless of provider, invalid JSON never escapes.
 */
async function structuredCompletion<S extends z.ZodTypeAny>(opts: {
  system: string;
  user: string;
  schema: S;
  schemaName: string;
}): Promise<z.infer<S>> {
  const jsonSchema = zodToJsonSchema(opts.schema, { target: "openAi" });

  try {
    const response = await openai().chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: opts.schemaName, strict: true, schema: jsonSchema as Record<string, unknown> },
      },
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned an empty response");
    return opts.schema.parse(JSON.parse(content));
  } catch (openaiError) {
    logger.warn(
      { err: openaiError instanceof Error ? openaiError.message : openaiError, schema: opts.schemaName },
      "OpenAI extraction failed — falling back to Claude"
    );
  }

  const response = await anthropic().messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 8192,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    tools: [
      {
        name: opts.schemaName,
        description: "Return the extracted data. This is the only valid way to respond.",
        input_schema: jsonSchema as Anthropic.Tool["input_schema"],
      },
    ],
    tool_choice: { type: "tool", name: opts.schemaName },
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude fallback did not return a tool call");
  }
  return opts.schema.parse(toolUse.input);
}


export async function classifyDocument(ocrText: string): Promise<Classification> {
  return structuredCompletion({
    system: CLASSIFY_SYSTEM,
    user: `Classify this document:\n\n${clip(ocrText)}`,
    schema: classificationSchema,
    schemaName: "classify_document",
  });
}

export async function extractFields(
  type: Classification["type"],
  ocrText: string
): Promise<ExtractionResult> {
  const { kind, schema, name } = schemaForType(type);
  const data = await structuredCompletion({
    system: EXTRACT_SYSTEM,
    user: `Document type: ${type}\n\nExtract all fields from this document:\n\n${clip(ocrText)}`,
    schema,
    schemaName: name,
  });
  return { kind, data } as ExtractionResult;
}
