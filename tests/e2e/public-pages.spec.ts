import { test, expect } from "@playwright/test";

test.describe("public surface", () => {
  test("marketing page renders with sign-up CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/bookkeeping/i);
    await expect(page.getByRole("link", { name: /start free trial/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  });

  test("unauthenticated users are redirected away from the dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/sign-in/);
    expect(page.url()).toContain("sign-in");
  });

  test("API docs page mounts Swagger UI", async ({ page }) => {
    await page.goto("/api-docs");
    await expect(page.locator("#swagger-ui .swagger-ui")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#swagger-ui")).toContainText("LedgerFlow AI API");
  });
});

test.describe("api", () => {
  test("health endpoint reports dependency checks", async ({ request }) => {
    const response = await request.get("/api/health");
    expect([200, 503]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty("checks.app", "ok");
    expect(body.checks).toHaveProperty("database");
    expect(body.checks).toHaveProperty("redis");
  });

  test("openapi spec is valid and versioned", async ({ request }) => {
    const response = await request.get("/api/v1/openapi");
    expect(response.status()).toBe(200);
    const spec = await response.json();
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBe("LedgerFlow AI API");
    expect(Object.keys(spec.paths).length).toBeGreaterThan(8);
  });

  test("protected API routes reject anonymous callers", async ({ request }) => {
    const response = await request.get("/api/v1/documents");
    expect([401, 404]).toContain(response.status()); // Clerk middleware gate
  });
});
