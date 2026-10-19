import Stripe from "stripe";
import { env } from "@/config/env";

let client: Stripe | null = null;

export function stripe(): Stripe {
  client ??= new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });
  return client;
}
