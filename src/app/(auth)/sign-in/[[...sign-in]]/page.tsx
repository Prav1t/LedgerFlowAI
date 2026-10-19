import { SignIn } from "@clerk/nextjs";

/**
 * Clerk hosts the full credential surface: password, forgot-password reset,
 * MFA challenge (TOTP / SMS / backup codes), and SSO — configured per
 * docs/AUTH.md. We render it inside our shell for a consistent look.
 */
export default function SignInPage() {
  return <SignIn />;
}
