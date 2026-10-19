import { describe, it, expect, vi, beforeEach } from "vitest";

// Repositories are mocked — this tests the sync service's event routing,
// role mapping, and payload handling in isolation.
vi.mock("@/server/repositories/user.repository", () => ({
  userRepository: { upsertFromClerk: vi.fn(), deleteByClerkId: vi.fn(), findByClerkId: vi.fn() },
}));
vi.mock("@/server/repositories/organization.repository", () => ({
  organizationRepository: {
    upsertFromClerk: vi.fn().mockResolvedValue({ id: "org_1" }),
    deleteByClerkOrgId: vi.fn(),
    upsertMembership: vi.fn().mockResolvedValue({ id: "mem_1", organizationId: "org_1", role: "OWNER" }),
    removeMembership: vi.fn(),
  },
}));
vi.mock("@/server/repositories/audit-log.repository", () => ({
  auditLogRepository: { record: vi.fn() },
}));

import { authSyncService } from "@/server/services/auth-sync.service";
import { userRepository } from "@/server/repositories/user.repository";
import { organizationRepository } from "@/server/repositories/organization.repository";
import { auditLogRepository } from "@/server/repositories/audit-log.repository";

beforeEach(() => vi.clearAllMocks());

describe("authSyncService", () => {
  it("syncs the primary email on user.created", async () => {
    await authSyncService.handleEvent("user.created", {
      id: "user_abc",
      email_addresses: [
        { id: "em_2", email_address: "secondary@x.com" },
        { id: "em_1", email_address: "primary@x.com" },
      ],
      primary_email_address_id: "em_1",
      first_name: "Ada",
      last_name: "Lovelace",
      image_url: null,
    });
    expect(userRepository.upsertFromClerk).toHaveBeenCalledWith(
      expect.objectContaining({ clerkId: "user_abc", email: "primary@x.com" })
    );
  });

  it("maps org:owner to OWNER and audits the join", async () => {
    await authSyncService.handleEvent("organizationMembership.created", {
      organization: { id: "clerk_org_1" },
      public_user_data: { user_id: "user_abc" },
      role: "org:owner",
    });
    expect(organizationRepository.upsertMembership).toHaveBeenCalledWith(
      expect.objectContaining({ role: "OWNER" })
    );
    expect(auditLogRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.member.joined" })
    );
  });

  it("maps unknown Clerk roles to VIEWER (least privilege)", async () => {
    await authSyncService.handleEvent("organizationMembership.created", {
      organization: { id: "clerk_org_1" },
      public_user_data: { user_id: "user_abc" },
      role: "org:member",
    });
    expect(organizationRepository.upsertMembership).toHaveBeenCalledWith(
      expect.objectContaining({ role: "VIEWER" })
    );
  });

  it("removes users on user.deleted", async () => {
    await authSyncService.handleEvent("user.deleted", { id: "user_abc" });
    expect(userRepository.deleteByClerkId).toHaveBeenCalledWith("user_abc");
  });

  it("ignores events it does not handle", async () => {
    await expect(authSyncService.handleEvent("session.created", {})).resolves.toBeUndefined();
  });
});
