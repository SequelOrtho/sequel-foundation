// Dirty detection for save surfaces (DESIGN-CONVENTIONS §3: "Save is disabled
// until something actually changed"). Pure snapshot/compare helpers so both
// controlled forms (compare state objects) and uncontrolled forms (snapshot
// FormData on mount, compare on input) share one definition of "dirty".

export type FormSnapshot = Record<string, string | string[]>;

/** FormData → plain comparable snapshot (multi-valued keys become arrays). */
export function formSnapshot(form: HTMLFormElement): FormSnapshot {
  const out: FormSnapshot = {};
  const data = new FormData(form);
  // One pass over the entries. Calling data.getAll(key) inside a loop over the
  // keys re-scans the whole entry list per key (O(keys x entries)) — on a
  // 60-field form that is ~3,600 comparisons per snapshot, and a snapshot is
  // taken on every input event. Single-valued keys stay bare strings; a name
  // only becomes an array on its second occurrence.
  for (const [key, raw] of data.entries()) {
    const value = typeof raw === "string" ? raw : raw.name;
    const seen = out[key];
    if (seen === undefined) out[key] = value;
    else if (Array.isArray(seen)) seen.push(value);
    else out[key] = [seen, value];
  }
  return out;
}

/** Deep-enough equality for snapshots: same keys, same string(s) per key. */
export function snapshotEqual(a: FormSnapshot, b: FormSnapshot): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    const av = a[k];
    const bv = b[k];
    if (Array.isArray(av) || Array.isArray(bv)) {
      const aa = Array.isArray(av) ? av : [av];
      const ba = Array.isArray(bv) ? bv : [bv];
      if (aa.length !== ba.length || aa.some((v, i) => v !== ba[i])) return false;
    } else if (av !== bv) {
      return false;
    }
  }
  return true;
}

/**
 * Keys whose values differ between two snapshots (either direction — added,
 * removed, or changed). Powers PER-SECTION dirty state: a section is dirty
 * when any of its field names is in the changed set, and a section save
 * re-baselines only its own keys so other sections keep their unsaved edits.
 */
export function snapshotChangedKeys(a: FormSnapshot, b: FormSnapshot): string[] {
  const valueEqual = (x: string | string[] | undefined, y: string | string[] | undefined) => {
    const xa = x == null ? [""] : Array.isArray(x) ? x : [x];
    const ya = y == null ? [""] : Array.isArray(y) ? y : [y];
    return xa.length === ya.length && xa.every((v, i) => v === ya[i]);
  };
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => !valueEqual(a[k], b[k]));
}

/**
 * Shallow object compare for controlled forms: dirty when any own key of
 * `current` differs from `initial` by Object.is. (Nullish and "" are distinct
 * on purpose — clearing a field is a change.)
 */
export function shallowDirty(
  initial: Record<string, unknown>,
  current: Record<string, unknown>,
): boolean {
  const keys = new Set([...Object.keys(initial), ...Object.keys(current)]);
  for (const k of keys) if (!Object.is(initial[k], current[k])) return true;
  return false;
}
