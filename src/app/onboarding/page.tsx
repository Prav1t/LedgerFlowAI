import { CreateOrganization } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/** Signed in, but no active organization yet → create or accept an invite. */
export default async function OnboardingPage() {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");
  if (orgId) redirect("/dashboard");

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Set up your workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create an organization for your firm or company. You can invite your team next.
          </p>
        </div>
        <CreateOrganization afterCreateOrganizationUrl="/dashboard" skipInvitationScreen={false} />
      </div>
    </main>
  );
}
