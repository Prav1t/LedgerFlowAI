"use client";

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { NotificationsPopover } from "./notifications-popover";
import { useUiStore } from "@/stores/ui-store";

export function Header() {
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b bg-background/80 px-4 backdrop-blur">
      <OrganizationSwitcher
        afterSelectOrganizationUrl="/dashboard"
        afterCreateOrganizationUrl="/dashboard"
        appearance={{ elements: { rootBox: "flex items-center" } }}
      />
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="hidden h-8 w-56 justify-between text-muted-foreground sm:flex"
          onClick={() => setCommandPaletteOpen(true)}
        >
          <span className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5" /> Search…
          </span>
          <kbd className="rounded border bg-muted px-1.5 font-mono text-[10px]">⌘K</kbd>
        </Button>
        <NotificationsPopover />
        <ThemeToggle />
        <UserButton />
      </div>
    </header>
  );
}
