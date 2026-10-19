export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-2 text-sm font-medium tracking-tight">
          <span className="grid h-6 w-6 place-items-center rounded bg-primary font-mono text-xs text-primary-foreground">
            L
          </span>
          LedgerFlow AI
        </div>
        {children}
      </div>
    </main>
  );
}
