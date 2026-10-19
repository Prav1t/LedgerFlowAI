import { describe, it, expect } from "vitest";
import { hasPermission, canAssignRole, ROLE_PERMISSIONS, PERMISSIONS } from "@/lib/auth/permissions";

describe("role permissions", () => {
  it("is strictly cumulative up the role ladder", () => {
    const order = ["VIEWER", "REVIEWER", "ACCOUNTANT", "ADMIN", "OWNER"] as const;
    for (let i = 1; i < order.length; i++) {
      const lower = ROLE_PERMISSIONS[order[i - 1]!];
      const higher = ROLE_PERMISSIONS[order[i]!];
      for (const p of lower) expect(higher.has(p)).toBe(true);
      expect(higher.size).toBeGreaterThan(lower.size);
    }
  });

  it("keeps viewers read-only", () => {
    expect(hasPermission("VIEWER", "documents:view")).toBe(true);
    expect(hasPermission("VIEWER", "documents:upload")).toBe(false);
    expect(hasPermission("VIEWER", "accounting:post")).toBe(false);
  });

  it("reserves posting for accountants and above", () => {
    expect(hasPermission("REVIEWER", "accounting:post")).toBe(false);
    expect(hasPermission("ACCOUNTANT", "accounting:post")).toBe(true);
  });

  it("reserves billing for owners", () => {
    expect(hasPermission("ADMIN", "org:manage_billing")).toBe(false);
    expect(hasPermission("OWNER", "org:manage_billing")).toBe(true);
  });

  it("never lets a member assign a role at or above their own", () => {
    expect(canAssignRole("ADMIN", "ADMIN")).toBe(false);
    expect(canAssignRole("ADMIN", "OWNER")).toBe(false);
    expect(canAssignRole("ADMIN", "ACCOUNTANT")).toBe(true);
    expect(canAssignRole("OWNER", "ADMIN")).toBe(true);
    expect(canAssignRole("ACCOUNTANT", "VIEWER")).toBe(false); // lacks org:manage_members
  });

  it("has every permission documented", () => {
    for (const set of Object.values(ROLE_PERMISSIONS)) {
      for (const p of set) expect(PERMISSIONS[p]).toBeTruthy();
    }
  });
});
