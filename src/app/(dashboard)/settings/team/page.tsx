import { OrganizationProfile } from "@clerk/nextjs";
import { requirePermission } from "@/lib/auth/context";

/**
 * Team management: invitations, removals, and Clerk-side role changes.
 * Clerk webhooks mirror every change into our DB, where ROLE_PERMISSIONS
 * governs what each member can actually do inside LedgerFlow.
 */
export default async function TeamSettingsPage() {
  await requirePermission("org:view_members");

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Team</h1>
      <OrganizationProfile routing="hash" />
    </div>
  );
}
