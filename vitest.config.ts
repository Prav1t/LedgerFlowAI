import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    environmentMatchGlobs: [["tests/**/*.test.tsx", "jsdom"]],
    globals: true,
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    coverage: { provider: "v8", include: ["src/**"], exclude: ["src/app/**", "src/components/ui/**"] },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
