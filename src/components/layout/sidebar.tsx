"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  ArrowLeftRight,
  BookOpen,
  BarChart3,
  Sparkles,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils/cn";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, shortcut: "G D" },
  { href: "/documents", label: "Documents", icon: FileText, shortcut: "G U" },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight, shortcut: "G T" },
  { href: "/accounting/chart-of-accounts", label: "Accounting", icon: BookOpen, shortcut: "G A" },
  { href: "/reports", label: "Reports", icon: BarChart3, shortcut: "G R" },
  { href: "/copilot", label: "Copilot", icon: Sparkles, shortcut: "G C" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-surface transition-[width] duration-200 md:flex",
        collapsed ? "w-14" : "w-56"
      )}
    >
      <div className={cn("flex h-14 items-center border-b px-3", collapsed && "justify-center")}>
        <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-primary font-mono text-xs text-primary-foreground">
            L
          </span>
          {!collapsed && <span>LedgerFlow</span>}
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 p-2">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href.split("/").slice(0, 2).join("/"));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                active
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                collapsed && "justify-center px-0"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  <kbd className="hidden font-mono text-[10px] text-muted-foreground/60 group-hover:inline">
                    {item.shortcut}
                  </kbd>
                </>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-0.5 border-t p-2">
        <Link
          href="/settings/team"
          title={collapsed ? "Settings" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
            collapsed && "justify-center px-0"
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && "Settings"}
        </Link>
        <button
          onClick={toggleSidebar}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );
}
