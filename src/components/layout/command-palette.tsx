"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  FileText,
  ArrowLeftRight,
  BookOpen,
  BarChart3,
  Sparkles,
  Users,
  Shield,
  Moon,
  Sun,
  Upload,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { useUiStore } from "@/stores/ui-store";

export function CommandPalette() {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => run(() => router.push("/dashboard"))}>
            <LayoutDashboard className="h-4 w-4" /> Dashboard <CommandShortcut>G D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/documents"))}>
            <FileText className="h-4 w-4" /> Documents <CommandShortcut>G U</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/transactions"))}>
            <ArrowLeftRight className="h-4 w-4" /> Transactions <CommandShortcut>G T</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/accounting/chart-of-accounts"))}>
            <BookOpen className="h-4 w-4" /> Chart of accounts <CommandShortcut>G A</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/reports"))}>
            <BarChart3 className="h-4 w-4" /> Reports <CommandShortcut>G R</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/copilot"))}>
            <Sparkles className="h-4 w-4" /> AI Copilot <CommandShortcut>G C</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run(() => router.push("/documents?upload=1"))}>
            <Upload className="h-4 w-4" /> Upload documents
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}>
            {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            Toggle theme
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Settings">
          <CommandItem onSelect={() => run(() => router.push("/settings/team"))}>
            <Users className="h-4 w-4" /> Team
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/settings/security"))}>
            <Shield className="h-4 w-4" /> Security
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
