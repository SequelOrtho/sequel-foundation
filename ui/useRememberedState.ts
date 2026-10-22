"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  parseRemembered,
  readLike,
  readRememberedRaw,
  subscribeRememberedViews,
  writeRememberedRaw,
} from "./remembered-view";

// useState for a list's view state — filters, search box, sort, grouping,
// on/off flags (DESIGN-CONVENTIONS §3, "List filters are remembered"). The
// value is remembered for this tab under `key`, so opening one item and coming
// back by a link, the browser's Back or a reload shows the list as it was left.
// The server render (and the first client render) uses `initial`; the stored
// value takes over right after hydration, so markup never mismatches.
//
// `key` names the list and the control, e.g. "plan-2027.entity"; give each
// control its own key. `read` checks a stored value (default `readLike`: the
// initial value's shape) — pass one when only some strings are valid, e.g. a
// sort key union; declare it at module level so its identity is stable.
// Setting the value back to `initial` forgets it. The third
// element resets to `initial` — wire every one into the list's Clear Filters.

type SetRemembered<T> = (next: T | ((prev: T) => T)) => void;

export function useRememberedState<T>(
  key: string,
  initial: T,
  read: (initial: T, value: unknown) => T = readLike,
): [T, SetRemembered<T>, () => void] {
  const initialRaw = JSON.stringify(initial);

  const raw = useSyncExternalStore(
    subscribeRememberedViews,
    () => readRememberedRaw(key),
    () => null,
  );

  const value = useMemo(
    () => parseRemembered(raw, JSON.parse(initialRaw) as T, read),
    [raw, initialRaw, read],
  );

  const set = useCallback<SetRemembered<T>>(
    (next) => {
      const init = JSON.parse(initialRaw) as T;
      const prev = parseRemembered(readRememberedRaw(key), init, read);
      const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      const json = JSON.stringify(resolved);
      writeRememberedRaw(key, json === initialRaw ? null : json);
    },
    [key, initialRaw, read],
  );

  const reset = useCallback(() => writeRememberedRaw(key, null), [key]);

  return [value, set, reset];
}
