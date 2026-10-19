import Link from "next/link";

export default function MarketingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <div className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        Documents in. Reviewed ledger entries out.
      </div>
      <h1 className="max-w-2xl text-center text-5xl font-semibold tracking-tight">
        Bookkeeping that closes itself — with a human on the approval key.
      </h1>
      <p className="max-w-xl text-center text-lg text-muted-foreground">
        LedgerFlow reads your invoices, receipts, and bank statements, drafts double-entry
        journal entries, and waits for your review before a single number is posted.
      </p>
      <div className="flex gap-3">
        <Link
          href="/sign-up"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Start free trial
        </Link>
        <Link
          href="/sign-in"
          className="rounded-md border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
