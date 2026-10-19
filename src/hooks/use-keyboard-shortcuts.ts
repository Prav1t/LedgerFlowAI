"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUiStore } from "@/stores/ui-store";

/**
 * Global shortcuts:
 *   ⌘K / Ctrl+K — command palette
 *   g then d/u/t/a/r/c — go to dashboard/documents/transactions/accounting/reports/copilot
 * Sequences expire after 800ms. Inputs and editors are exempt.
 */
const GO_TARGETS: Record<string, string> = {
  d: "/dashboard",
  u: "/documents",
  t: "/transactions",
  a: "/accounting/chart-of-accounts",
  r: "/reports",
  c: "/copilot",
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function useKeyboardShortcuts() {
  const router = useRouter();
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette);
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

      if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const target = GO_TARGETS[e.key.toLowerCase()];
        if (target) {
          e.preventDefault();
          router.push(target);
        }
        return;
      }
      if (e.key.toLowerCase() === "g") {
        pendingG.current = window.setTimeout(() => (pendingG.current = null), 800);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, toggleCommandPalette]);
}
