"use client";

import { useEffect } from "react";

// Global "unsaved changes" guard. Any surface with dirty local draft state calls
// useUnsavedGuard(key, dirty); while at least one key is dirty, a single
// beforeunload handler warns before the tab is closed or reloaded.
//
// Keys are namespaced by the caller so multiple editors coexist without
// clobbering each other. Two consequences worth knowing:
//
//   - The key must be unique per mounted surface. Two surfaces sharing a key
//     means one unmounting deletes the other's dirty flag and the warning
//     silently stops firing. Prefix with the surface ("editor:pilot").
//   - The handler is installed lazily and left in place — a no-op once every
//     key clears, which is cheaper than add/remove churn on each keystroke.
//
// Lifted from the Acquisition Hub, where it sat in the app while the rest of
// the §3 save kit lived here; it has no app-specific content.

const dirtyKeys = new Set<string>();
let installed = false;

function beforeUnload(e: BeforeUnloadEvent) {
  if (dirtyKeys.size === 0) return;
  e.preventDefault();
  // Legacy browsers require returnValue to be set to trigger the prompt.
  e.returnValue = "";
}

function ensureInstalled() {
  if (installed || typeof window === "undefined") return;
  window.addEventListener("beforeunload", beforeUnload);
  installed = true;
}

export function useUnsavedGuard(key: string, dirty: boolean) {
  useEffect(() => {
    ensureInstalled();
    if (dirty) dirtyKeys.add(key);
    else dirtyKeys.delete(key);
    return () => {
      dirtyKeys.delete(key);
    };
  }, [key, dirty]);
}

/** Aggregate dirty state — for tests, and for callers wanting to gate a router push. */
export function hasUnsavedChanges(): boolean {
  return dirtyKeys.size > 0;
}

/** Test-only: drop every registered key. */
export function resetUnsavedGuard(): void {
  dirtyKeys.clear();
}
