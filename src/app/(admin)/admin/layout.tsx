import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";

/**
 * Platform staff area — gated on User.isPlatformAdmin (set via
 * `UPDATE users SET "isPlatformAdmin" = true` by an operator; never
 * grantable through the product UI). Org roles have no power here.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.isPlatformAdmin) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-warning/10 px-4 py-2 text-center text-xs font-medium text-warning-foreground">
        Platform administration — actions here affect all tenants
      </header>
      <main className="px-4 py-8">{children}</main>
    </div>
  );
}
