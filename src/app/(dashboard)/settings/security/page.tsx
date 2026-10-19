import { UserProfile } from "@clerk/nextjs";

/**
 * Personal security: password changes and MFA enrollment
 * (authenticator app TOTP, SMS codes, backup codes) — managed by Clerk.
 * Enable the MFA strategies in the Clerk dashboard per docs/AUTH.md.
 */
export default function SecuritySettingsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Account security</h1>
      <UserProfile routing="hash" />
    </div>
  );
}
