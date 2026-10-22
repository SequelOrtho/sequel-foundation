// Remembered list views (DESIGN-CONVENTIONS §3, "List filters are remembered";
// owner report, Project Hub 2027 plan list, 2026-10-22: "when making filtering
// selections and then opening an item and then clicking the link to go back to
// the 2027 list, it doesn't save the filters"). A list's filters, search box,
// sort and grouping live in this tab's sessionStorage under one prefix, so a
// "← Back" link (a fresh render of the list), the browser's Back and a reload
// all bring the view back, a new tab starts clean, and Sign Out wipes every
// list at once. Storage blocked (private mode, previews) falls back to this
// tab's memory: the page still works, it just forgets on reload.
//
// The pure half lives here (storage access, parsing, clearing) so it is tested
// without React; the hook is useRememberedState.

/** Every remembered view is stored under this prefix; clearRememberedViews removes them all. */
export const REMEMBERED_VIEW_PREFIX = "sf.view.";

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** The stored JSON for `key` (without the prefix), or null when nothing is remembered. */
export function readRememberedRaw(key: string): string | null {
  const full = REMEMBERED_VIEW_PREFIX + key;
  try {
    const s = storage();
    const stored = s?.getItem(full);
    if (stored != null) return stored;
  } catch {
    // fall through to memory
  }
  return memory.get(full) ?? null;
}

/** Store `raw` for `key` (null forgets it) and tell every mounted list. */
export function writeRememberedRaw(key: string, raw: string | null): void {
  const full = REMEMBERED_VIEW_PREFIX + key;
  let stored = false;
  try {
    const s = storage();
    if (s) {
      if (raw === null) s.removeItem(full);
      else s.setItem(full, raw);
      stored = true;
    }
  } catch {
    stored = false;
  }
  if (raw === null || stored) memory.delete(full);
  else memory.set(full, raw);
  listeners.forEach((l) => l());
}

/** Subscribe to remembered-view changes (the useSyncExternalStore contract). */
export function subscribeRememberedViews(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Forget every remembered list view in this tab. SignOutForm and SessionWatch
 * call it, so the next person on a shared computer starts with clean lists.
 */
export function clearRememberedViews(): void {
  const s = storage();
  if (s) {
    try {
      const keys: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && k.startsWith(REMEMBERED_VIEW_PREFIX)) keys.push(k);
      }
      keys.forEach((k) => s.removeItem(k));
    } catch {
      // storage unreadable: memory below still clears
    }
  }
  memory.clear();
  listeners.forEach((l) => l());
}

/**
 * The default reader: a stored value counts only when it has the initial
 * value's shape — same type, an array for an array, and for a plain object
 * each known key of the same type (unknown keys dropped, missing keys take the
 * initial value). Anything else reads as the initial value, so a list whose
 * filters changed shape since the value was stored never breaks.
 */
export function readLike<T>(initial: T, value: unknown): T {
  if (Array.isArray(initial)) {
    if (!Array.isArray(value)) return initial;
    const sample = initial[0];
    if (sample !== undefined && !value.every((v) => typeof v === typeof sample)) return initial;
    if (sample === undefined && !value.every((v) => typeof v === "string" || typeof v === "number")) return initial;
    return value as T;
  }
  if (initial !== null && typeof initial === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return initial;
    const out: Record<string, unknown> = { ...(initial as Record<string, unknown>) };
    for (const [k, def] of Object.entries(initial as Record<string, unknown>)) {
      if (!(k in (value as Record<string, unknown>))) continue;
      const v = (value as Record<string, unknown>)[k];
      out[k] = def === null ? v : readLike(def, v);
    }
    return out as T;
  }
  if (initial === null) return (value ?? null) as T;
  return typeof value === typeof initial ? (value as T) : initial;
}

/** Parse stored JSON through `read`, falling back to `initial` on bad JSON. */
export function parseRemembered<T>(raw: string | null, initial: T, read: (initial: T, value: unknown) => T = readLike): T {
  if (raw === null) return initial;
  try {
    return read(initial, JSON.parse(raw));
  } catch {
    return initial;
  }
}
