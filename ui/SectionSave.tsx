"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "./Button";
import { SaveStateIndicator } from "./SaveState";
import { useUnsavedGuard } from "./unsaved-guard";
import { formSnapshot, snapshotEqual, type FormSnapshot } from "./form-dirty";

// Save-surface kit (DESIGN-CONVENTIONS §3, the save conventions):
//   1. Saving keeps you in place — confirm with a toast + the SaveState chip;
//      never navigate away on success. Navigation is the user's move.
//   2. Save is disabled until something actually changed (dirty-aware), with
//      the reason on the disabled control's title.
//   3. Long forms save per section — each section carries its own compact
//      Save bar so the user never scrolls to commit; a bottom Save-all stays
//      for the full sweep. Both are dirty-aware.
// useSaveRunner holds the async lifecycle; SectionSaveBar is the standard
// affordance (button + SaveStateIndicator + inline error); useFormDirty wires
// dirty detection onto an uncontrolled <form> via snapshot/compare.

export type DraftSave = {
  /** True when the draft differs from the last committed baseline. */
  dirty: boolean;
  runner: SaveRunner;
};

export type SaveRunner = {
  saving: boolean;
  savedAt: number | null;
  error: string | null;
  /** Run the save; resolves true on success. Errors land in `error`. */
  run: () => Promise<boolean>;
};

/**
 * Async save lifecycle for one save surface (a section or a whole form).
 * `onSave` returning `false` (or throwing) marks failure; anything else marks
 * success and stamps `savedAt`. Fire the confirmation toast inside `onSave` —
 * messages are the app's voice, the runner only tracks state.
 */
export function useSaveRunner(onSave: () => Promise<boolean | void>): SaveRunner {
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await onSave();
      const ok = result !== false;
      if (ok) setSavedAt(Date.now());
      else setError("Save failed.");
      return ok;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [onSave]);
  return { saving, savedAt, error, run };
}

/**
 * Dirty detection for an uncontrolled form (or one form SECTION): snapshot on
 * first input-capable render, recompare on every input/change event.
 *
 *   const d = useFormDirty();
 *   <form ref={d.attach} onInput={d.recheck} onChange={d.recheck}>…</form>
 *   // after a successful save: d.markClean()
 */
export function useFormDirty() {
  const formRef = useRef<HTMLFormElement | null>(null);
  const baseline = useRef<FormSnapshot | null>(null);
  const [dirty, setDirty] = useState(false);
  const attach = useCallback((el: HTMLFormElement | null) => {
    formRef.current = el;
    if (el && baseline.current === null) baseline.current = formSnapshot(el);
  }, []);
  const recheck = useCallback(() => {
    const el = formRef.current;
    if (!el || baseline.current === null) return;
    setDirty(!snapshotEqual(baseline.current, formSnapshot(el)));
  }, []);
  const markClean = useCallback(() => {
    const el = formRef.current;
    if (el) baseline.current = formSnapshot(el);
    setDirty(false);
  }, []);
  return { attach, recheck, markClean, dirty };
}

/**
 * The standard save affordance: dirty-disabled Save + SaveState chip + inline
 * error. Use size "sm" inside sections, "md" for the bottom Save-all.
 */
/**
 * Dirty-aware save for a CONTROLLED draft — the object/array form of
 * `useFormDirty`, which only covers uncontrolled <form> elements. Dirty is a
 * JSON snapshot of `draftDeps` compared against the last committed baseline,
 * and the tab-close guard is wired for free.
 *
 * Pass EVERY piece of state the `persist` body reads as `draftDeps`, or Save
 * will not light up when that state changes.
 *
 *   const save = useDraftSave("pilot", [draft], async () => {
 *     await patch({ pilot: draft });
 *   });
 *   <SectionSaveBar dirty={save.dirty} runner={save.runner} />
 *
 * The snapshot is deliberately NOT memoized. It looks like it should be — it
 * re-serializes on renders where the draft did not change — but that was
 * measured on the worst real draft in the fleet (a 10-clinic, 241-question
 * diligence questionnaire, ~80KB) at 0.17ms, about 1% of a frame and far below
 * the cost of the re-render that triggered it. Memoizing needs a
 * caller-supplied dependency list, which the React Compiler's
 * `react-hooks/use-memo` rule rejects for not being a literal. Not worth a
 * suppression or a contract change; revisit only with a measurement showing
 * otherwise.
 */
export function useDraftSave(
  guardKey: string,
  draftDeps: unknown[],
  persist: () => Promise<void>,
): DraftSave {
  const snap = JSON.stringify(draftDeps) ?? "";
  const [baseline, setBaseline] = useState(snap);
  const dirty = snap !== baseline;
  const runner = useSaveRunner(async () => {
    // Capture before the await: this closure belongs to the render the user is
    // looking at, so the baseline moves to exactly what was saved even if they
    // keep typing during the request.
    const committed = snap;
    await persist();
    setBaseline(committed);
  });
  useUnsavedGuard(`draft:${guardKey}`, dirty);
  return { dirty, runner };
}

export function SectionSaveBar({
  dirty,
  runner,
  label = "Save",
  busyLabel = "Saving…",
  size = "sm",
  disabled = false,
  className = "",
}: {
  dirty: boolean;
  runner: SaveRunner;
  label?: string;
  busyLabel?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`.trim()} data-no-print>
      {/* busy (not disabled) while saving: Button's busy prop sets aria-busy and
          swaps the label, which a bare `disabled` drops — and this is the most
          reliably async control in the kit, so it is the one that most needs to
          announce itself. */}
      <Button
        type="button"
        size={size}
        disabled={disabled || !dirty}
        busy={runner.saving}
        busyLabel={busyLabel}
        title={!dirty && !runner.saving ? "No changes to save" : undefined}
        onClick={() => void runner.run()}
      >
        {label}
      </Button>
      <SaveStateIndicator saving={runner.saving} dirty={dirty && !runner.saving} savedAt={runner.savedAt} />
      {runner.error && (
        <span role="alert" className="text-xs text-red-700 dark:text-red-400">
          {runner.error}
        </span>
      )}
    </div>
  );
}
