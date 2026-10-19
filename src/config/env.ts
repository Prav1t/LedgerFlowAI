import { z } from "zod";

/**
 * Typed, validated environment access. Import `env` everywhere instead of
 * reading process.env directly — fails fast at boot with a readable error.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SECRET: z.string().min(1).optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
  DOCUMENT_AI_PROJECT_ID: z.string().optional(),
  DOCUMENT_AI_LOCATION: z.string().default("us"),
  DOCUMENT_AI_PROCESSOR_ID: z.string().optional(),
  OPENAI_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  FIELD_ENCRYPTION_KEY: z.string().min(32),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
});

type ServerEnv = z.infer<typeof serverSchema>;
type ClientEnv = z.infer<typeof clientSchema>;

function buildEnv(): ServerEnv & ClientEnv {
  const isServer = typeof window === "undefined";
  const parsedClient = clientSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  });
  if (!parsedClient.success) {
    throw new Error(`Invalid client env:\n${JSON.stringify(parsedClient.error.flatten().fieldErrors, null, 2)}`);
  }
  if (!isServer) return parsedClient.data as ServerEnv & ClientEnv;

  const parsedServer = serverSchema.safeParse(process.env);
  if (!parsedServer.success) {
    throw new Error(`Invalid server env:\n${JSON.stringify(parsedServer.error.flatten().fieldErrors, null, 2)}`);
  }
  return { ...parsedServer.data, ...parsedClient.data };
}

export const env = buildEnv();
