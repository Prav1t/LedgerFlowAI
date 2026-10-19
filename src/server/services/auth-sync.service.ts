import type { MemberRole } from "@prisma/client";
import { userRepository } from "@/server/repositories/user.repository";
import { organizationRepository } from "@/server/repositories/organization.repository";
import { auditLogRepository } from "@/server/repositories/audit-log.repository";
import { logger } from "@/lib/utils/logger";
import { provisionDefaultChart } from "@/server/services/chart-provisioning.service";

/** Clerk org roles → our member roles. New members land as VIEWER until promoted. */
function mapClerkRole(clerkRole: string): MemberRole {
  switch (clerkRole) {
    case "org:owner":
    case "admin": // legacy Clerk role string
      return "OWNER";
    case "org:admin":
      return "ADMIN";
    default:
      return "VIEWER";
  }
}

interface ClerkEmail {
  id: string;
  email_address: string;
}

/* Payload shapes cover exactly the fields we consume — Clerk sends more. */
interface UserPayload {
  id: string;
  email_addresses: ClerkEmail[];
  primary_email_address_id: string | null;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
}

interface OrgPayload {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
}

interface MembershipPayload {
  organization: { id: string };
  public_user_data: { user_id: string };
  role: string;
}

export const authSyncService = {
  async handleEvent(type: string, data: unknown): Promise<void> {
    switch (type) {
      case "user.created":
      case "user.updated": {
        const u = data as UserPayload;
        const primary =
          u.email_addresses.find((e) => e.id === u.primary_email_address_id) ??
          u.email_addresses[0];
        if (!primary) {
          logger.warn({ clerkId: u.id }, "Clerk user has no email — skipping sync");
          return;
        }
        await userRepository.upsertFromClerk({
          clerkId: u.id,
          email: primary.email_address,
          firstName: u.first_name,
          lastName: u.last_name,
          imageUrl: u.image_url,
        });
        return;
      }

      case "user.deleted": {
        const { id } = data as { id: string };
        await userRepository.deleteByClerkId(id);
        return;
      }

      case "organization.created":
      case "organization.updated": {
        const o = data as OrgPayload;
        const org = await organizationRepository.upsertFromClerk({
          clerkOrgId: o.id,
          name: o.name,
          slug: o.slug,
          imageUrl: o.image_url,
        });
        if (type === "organization.created") {
          await provisionDefaultChart(org.id);
          await auditLogRepository.record({
            organizationId: org.id,
            action: "auth.organization.created",
            entityType: "Organization",
            entityId: org.id,
            metadata: { name: o.name },
          });
        }
        return;
      }

      case "organization.deleted": {
        const { id } = data as { id: string };
        await organizationRepository.deleteByClerkOrgId(id);
        return;
      }

      case "organizationMembership.created":
      case "organizationMembership.updated": {
        const m = data as MembershipPayload;
        const membership = await organizationRepository.upsertMembership({
          clerkOrgId: m.organization.id,
          clerkUserId: m.public_user_data.user_id,
          role: mapClerkRole(m.role),
        });
        await auditLogRepository.record({
          organizationId: membership.organizationId,
          action:
            type === "organizationMembership.created"
              ? "auth.member.joined"
              : "auth.member.role_changed",
          entityType: "OrganizationMember",
          entityId: membership.id,
          metadata: { role: membership.role },
        });
        return;
      }

      case "organizationMembership.deleted": {
        const m = data as MembershipPayload;
        await organizationRepository.removeMembership(
          m.organization.id,
          m.public_user_data.user_id
        );
        return;
      }

      default:
        logger.debug({ type }, "Ignoring unhandled Clerk event");
    }
  },
};
