// Dirty detection for save surfaces (DESIGN-CONVENTIONS §3: "Save is disabled
// until something actually changed"). Pure snapshot/compare helpers so both
// controlled forms (compare state objects) and uncontrolled forms (the form as
// the server sent it, compared with FormData on input) share one definition of
// "dirty".

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

/**
 * The form as the SERVER sent it: each control's default (`defaultValue`,
 * `defaultChecked`, the options marked `selected`), in `formSnapshot`'s shape.
 *
 * It is the baseline for "has anything changed?". The live form is the wrong
 * baseline: a person can pick a value while the page's script is still
 * loading, and a browser puts earlier picks back after a reload or Back, both
 * before any hook runs. A baseline read from the live form then counts that
 * pick as the loaded value, so Save stays off and the pick is never sent
 * (Project Hub, 2026-11-16: a Type changed to JDI kept coming back as Sprint).
 *
 * It follows FormData's rules so an untouched form compares equal: controls
 * that are disabled (or inside a disabled fieldset), unnamed controls and
 * buttons are left out; an unticked box or radio adds nothing; a file input
 * adds "".
 */
export function serverSnapshot(form: HTMLFormElement): FormSnapshot {
  const out: FormSnapshot = {};
  const add = (key: string, value: string) => {
    const seen = out[key];
    if (seen === undefined) out[key] = value;
    else if (Array.isArray(seen)) seen.push(value);
    else out[key] = [seen, value];
  };
  for (const el of Array.from(form.elements)) {
    if (
      !(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)
    ) {
      continue;
    }
    // :disabled, not el.disabled: a control inside <fieldset disabled> is left
    // out of FormData too.
    if (!el.name || el.matches(":disabled")) continue;
    if (el instanceof HTMLSelectElement) {
      const marked = Array.from(el.options).filter((o) => o.defaultSelected);
      // Server HTML marks the loaded option(s). A select drawn in the browser
      // (a move between pages, with no server HTML to wait on) marks none, and
      // nobody can have changed it yet: its live value is the loaded one.
      const chosen = marked.length === 0 ? Array.from(el.selectedOptions) : el.multiple ? marked : marked.slice(-1);
      for (const o of chosen) if (!o.disabled) add(el.name, o.value);
    } else if (el instanceof HTMLTextAreaElement) {
      add(el.name, defaultValueAsRead(el));
    } else if (["submit", "button", "reset", "image"].includes(el.type)) {
      continue;
    } else if (el.type === "checkbox" || el.type === "radio") {
      if (el.defaultChecked) add(el.name, el.value);
    } else if (el.type === "file") {
      add(el.name, "");
    } else {
      add(el.name, defaultValueAsRead(el));
    }
  }
  return out;
}

/**
 * A control's default text as its `value` would read it. The two differ: a
 * text box reads every line break as LF whatever the stored text holds, and a
 * number or date box reads a default it cannot parse as "". Reading the raw
 * default would make such a field look changed the first time the form is
 * touched. A detached copy is asked, so the control itself is never written.
 */
function defaultValueAsRead(el: HTMLInputElement | HTMLTextAreaElement): string {
  const copy = el.cloneNode(false) as HTMLInputElement | HTMLTextAreaElement;
  copy.value = el.defaultValue;
  return copy.value;
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
